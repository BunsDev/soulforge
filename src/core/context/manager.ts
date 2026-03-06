import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateText } from "ai";
import { useRepoMapStore } from "../../stores/repomap.js";
import type { EditorIntegration, ForgeMode, TaskRouter } from "../../types/index.js";
import { buildGitContext } from "../git/status.js";
import { RepoMap, type SymbolForSummary } from "../intelligence/repo-map.js";
import { resolveModel } from "../llm/provider.js";
import { MemoryManager } from "../memory/manager.js";
import { getModeInstructions } from "../modes/prompts.js";
import { buildForbiddenContext, isForbidden } from "../security/forbidden.js";
import { setFileEventHandlers } from "../tools/file-events.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  "__pycache__",
  ".cache",
  "coverage",
]);

/**
 * Context Manager — gathers relevant context from the codebase
 * to include in LLM prompts for better responses.
 */
export class ContextManager {
  private cwd: string;
  private skills = new Map<string, string>();
  private gitContext: string | null = null;
  private memoryManager: MemoryManager;
  private forgeMode: ForgeMode = "default";
  private editorFile: string | null = null;
  private editorOpen = false;
  private editorVimMode: string | null = null;
  private editorCursorLine = 1;
  private editorCursorCol = 0;
  private editorVisualSelection: string | null = null;
  private editorIntegration: EditorIntegration | null = null;
  private fileTreeCache: { tree: string; at: number } | null = null;
  private projectInfoCache: { info: string | null; at: number } | null = null;
  private repoMap: RepoMap;
  private repoMapReady = false;
  private repoMapEnabled = true;
  private editedFiles = new Set<string>();
  private mentionedFiles = new Set<string>();
  private conversationTerms: string[] = [];
  private conversationTokens = 0;
  private repoMapCache: { content: string; at: number } | null = null;
  private taskRouter: TaskRouter | undefined;
  private static readonly REPO_MAP_TTL = 5_000; // 5s — covers getContextBreakdown + buildSystemPrompt in same prompt

  private static readonly FILE_TREE_TTL = 30_000; // 30s
  private static readonly PROJECT_INFO_TTL = 300_000; // 5min

  constructor(cwd: string) {
    this.cwd = cwd;
    this.memoryManager = new MemoryManager(cwd);
    this.repoMap = new RepoMap(cwd);
    this.wireRepoMapCallbacks();
    this.wireFileEventHandlers();
    this.startRepoMapScan();
  }

  private wireFileEventHandlers(): void {
    setFileEventHandlers({
      onFileEdited: (absPath, _content) => this.onFileChanged(absPath),
      onFileRead: (absPath) => this.trackMentionedFile(absPath),
    });
  }

  private startRepoMapScan(): void {
    this.syncRepoMapStore("scanning");
    this.repoMap.scan().catch(() => {});
  }

  private wireRepoMapCallbacks(): void {
    this.repoMap.onProgress = (indexed, total) => {
      const store = useRepoMapStore.getState();
      store.setScanProgress(`${String(indexed)}/${String(total)}`);
      const stats = this.repoMap.getStats();
      store.setStats(stats.files, stats.symbols, stats.edges, this.repoMap.dbSizeBytes());
    };
    this.repoMap.onScanComplete = (success) => {
      if (success) {
        this.repoMapReady = true;
        this.syncRepoMapStore("ready");
      } else {
        this.syncRepoMapStore("error");
      }
    };
  }

  private syncRepoMapStore(status: "off" | "scanning" | "ready" | "error"): void {
    const store = useRepoMapStore.getState();
    store.setStatus(status);
    const stats = this.repoMap.getStats();
    store.setStats(stats.files, stats.symbols, stats.edges, this.repoMap.dbSizeBytes());
    if (status !== "scanning") store.setScanProgress("");
  }

  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  /** Get the current forge mode */
  getForgeMode(): ForgeMode {
    return this.forgeMode;
  }

  /** Set the current forge mode */
  setForgeMode(mode: ForgeMode): void {
    this.forgeMode = mode;
  }

  /** Set which editor/LSP integrations are active */
  setEditorIntegration(settings: EditorIntegration): void {
    this.editorIntegration = settings;
  }

  /** Update editor state so Forge knows what's open in neovim */
  setEditorState(
    open: boolean,
    file: string | null,
    vimMode?: string,
    cursorLine?: number,
    cursorCol?: number,
    visualSelection?: string | null,
  ): void {
    this.editorOpen = open;
    this.editorFile = file;
    this.editorVimMode = vimMode ?? null;
    this.editorCursorLine = cursorLine ?? 1;
    this.editorCursorCol = cursorCol ?? 0;
    this.editorVisualSelection = visualSelection ?? null;
  }

  /** Invalidate cached file tree (call after agent edits files) */
  invalidateFileTree(): void {
    this.fileTreeCache = null;
  }

  /** Notify repo map that a file changed (call after edits) */
  onFileChanged(absPath: string): void {
    this.repoMap.onFileChanged(absPath);
    this.editedFiles.add(absPath);
    this.repoMapCache = null;
  }

  /** Track a file mentioned in conversation (tool reads, grep hits, etc.) */
  trackMentionedFile(absPath: string): void {
    this.mentionedFiles.add(absPath);
  }

  /** Update conversation context for repo map ranking */
  updateConversationContext(input: string, totalTokens: number): void {
    this.conversationTokens = totalTokens;
    this.conversationTerms = extractConversationTerms(input);
  }

  /** Reset per-conversation tracking (call on new session / context clear) */
  resetConversationTracking(): void {
    this.editedFiles.clear();
    this.mentionedFiles.clear();
    this.conversationTerms = [];
    this.conversationTokens = 0;
    this.repoMapCache = null;
  }

  /** Render repo map with full tracked context (cached within TTL) */
  renderRepoMap(): string {
    if (!this.repoMapReady) return "";
    const now = Date.now();
    if (this.repoMapCache && now - this.repoMapCache.at < ContextManager.REPO_MAP_TTL) {
      return this.repoMapCache.content;
    }
    const content = this.repoMap.render({
      editorFile: this.editorFile,
      editedFiles: [...this.editedFiles],
      mentionedFiles: [...this.mentionedFiles],
      conversationTerms: this.conversationTerms,
      conversationTokens: this.conversationTokens,
    });
    this.repoMapCache = { content, at: now };
    return content;
  }

  /** Get the repo map instance for direct access */
  getRepoMap(): RepoMap {
    return this.repoMap;
  }

  isRepoMapEnabled(): boolean {
    return this.repoMapEnabled;
  }

  isRepoMapReady(): boolean {
    return this.repoMapReady;
  }

  setRepoMapEnabled(enabled: boolean): void {
    this.repoMapEnabled = enabled;
    if (!enabled) {
      this.syncRepoMapStore("off");
    } else if (this.repoMapReady) {
      this.syncRepoMapStore("ready");
    }
  }

  setSemanticSummaries(enabled: boolean): void {
    this.repoMap.setSemanticSummaries(enabled);
    const store = useRepoMapStore.getState();
    if (!enabled) {
      store.setSemanticStatus("off");
      store.setSemanticProgress("");
      store.setSemanticModel("");
    } else {
      const stats = this.repoMap.getStats();
      store.setSemanticCount(stats.summaries);
      if (stats.summaries > 0) {
        store.setSemanticStatus("ready");
      }
      // Don't set "off" here — generateSemanticSummaries will set "generating" immediately
    }
  }

  clearSemanticSummaries(): void {
    this.repoMap.clearSemanticSummaries();
    const store = useRepoMapStore.getState();
    store.setSemanticCount(0);
    store.setSemanticProgress("");
    if (this.repoMap.isSemanticEnabled()) {
      store.setSemanticStatus("off");
    }
  }

  isSemanticEnabled(): boolean {
    return this.repoMap.isSemanticEnabled();
  }

  setTaskRouter(router: TaskRouter | undefined): void {
    this.taskRouter = router;
  }

  getSemanticModelId(fallback: string): string {
    return this.taskRouter?.semantic ?? fallback;
  }

  async generateSemanticSummaries(modelId: string): Promise<number> {
    if (!this.repoMapReady) return 0;

    const store = useRepoMapStore.getState();
    store.setSemanticStatus("generating");
    store.setSemanticProgress("preparing...");
    store.setSemanticModel(modelId);

    const model = resolveModel(modelId);
    const CHUNK = 10;
    let processed = 0;

    const generator = async (batch: SymbolForSummary[]) => {
      const all: Array<{ name: string; summary: string }> = [];

      for (let i = 0; i < batch.length; i += CHUNK) {
        const chunk = batch.slice(i, i + CHUNK);
        const prompt = chunk
          .map(
            (s, j) =>
              `[${String(j + 1)}] ${s.kind} \`${s.name}\` in ${s.filePath}:\n${s.signature ? `${s.signature}\n` : ""}${s.code}`,
          )
          .join("\n\n");

        store.setSemanticProgress(
          `${String(processed + 1)}-${String(Math.min(processed + CHUNK, batch.length))}/${String(batch.length)}`,
        );

        const { text } = await generateText({
          model,
          system:
            "Generate a one-line summary (max 80 chars) for each code symbol below. Output ONLY lines in the format:\nSymbolName: one-line summary\nNo numbering, no backticks, no extra text.",
          prompt,
        });

        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const colonIdx = trimmed.indexOf(":");
          if (colonIdx < 1) continue;
          const name = trimmed
            .slice(0, colonIdx)
            .replace(/^[`*\d.)\]]+\s*/, "")
            .trim();
          const summary = trimmed.slice(colonIdx + 1).trim();
          if (name && summary && /^\w+$/.test(name)) {
            all.push({ name, summary });
          }
        }

        processed += chunk.length;
      }

      return all;
    };

    this.repoMap.setSummaryGenerator(generator);

    try {
      const count = await this.repoMap.generateSemanticSummaries();
      const stats = this.repoMap.getStats();
      store.setSemanticCount(stats.summaries);
      store.setSemanticStatus(stats.summaries > 0 ? "ready" : "off");
      store.setSemanticProgress("");
      return count;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      store.setSemanticStatus("error");
      store.setSemanticProgress(msg.slice(0, 80));
      throw new Error(`Semantic summary generation failed: ${msg}`);
    }
  }

  dispose(): void {
    this.repoMap.close();
    this.memoryManager.close();
    setFileEventHandlers({});
  }

  async refreshRepoMap(): Promise<void> {
    this.syncRepoMapStore("scanning");
    this.repoMap.clear();
    await this.repoMap.scan().catch(() => {});
  }

  clearRepoMap(): void {
    this.repoMap.clear();
    this.repoMapReady = false;
    this.syncRepoMapStore("off");
  }

  /** Pre-fetch git context (call before buildSystemPrompt) */
  async refreshGitContext(): Promise<void> {
    this.gitContext = await buildGitContext(this.cwd);
  }

  /** Add a loaded skill to the system prompt */
  addSkill(name: string, content: string): void {
    this.skills.set(name, content);
  }

  /** Remove a loaded skill from the system prompt */
  removeSkill(name: string): void {
    this.skills.delete(name);
  }

  /** Get the names of all currently loaded skills */
  getActiveSkills(): string[] {
    return [...this.skills.keys()];
  }

  /** Get a breakdown of what's in the context and how much space each section uses */
  getContextBreakdown(): { section: string; chars: number; active: boolean }[] {
    const sections: { section: string; chars: number; active: boolean }[] = [];

    // Core + tools reference (always present)
    sections.push({
      section: "Core + tool reference",
      chars: 1800, // approximate: identity + all tool docs + guidelines
      active: true,
    });

    const projectInfo = this.getProjectInfo();
    sections.push({
      section: "Project info",
      chars: projectInfo?.length ?? 0,
      active: projectInfo !== null,
    });

    if (this.repoMapReady) {
      const map = this.renderRepoMap();
      sections.push({ section: "Repo map", chars: map.length, active: true });
    } else {
      const fileTree = this.getFileTree(3);
      sections.push({ section: "File tree", chars: fileTree.length, active: true });
    }

    sections.push({
      section: "Editor",
      chars: this.editorOpen && this.editorFile ? 200 : 0,
      active: this.editorOpen && this.editorFile !== null,
    });

    sections.push({
      section: "Git context",
      chars: this.gitContext?.length ?? 0,
      active: this.gitContext !== null,
    });

    const memoryContext = this.memoryManager.buildMemoryIndex();
    sections.push({
      section: "Project memory",
      chars: memoryContext?.length ?? 0,
      active: memoryContext !== null,
    });

    const modeInstructions = getModeInstructions(this.forgeMode);
    sections.push({
      section: `Mode (${this.forgeMode})`,
      chars: modeInstructions?.length ?? 0,
      active: modeInstructions !== null,
    });

    let skillChars = 0;
    for (const [, content] of this.skills) {
      skillChars += content.length;
    }
    sections.push({
      section: `Skills (${String(this.skills.size)})`,
      chars: skillChars,
      active: this.skills.size > 0,
    });

    return sections;
  }

  /** Clear optional context sections */
  clearContext(what: "git" | "memory" | "skills" | "all"): string[] {
    const cleared: string[] = [];
    if (what === "git" || what === "all") {
      if (this.gitContext) {
        this.gitContext = null;
        cleared.push("git");
      }
    }
    if (what === "skills" || what === "all") {
      if (this.skills.size > 0) {
        const names = [...this.skills.keys()];
        for (const n of names) this.skills.delete(n);
        cleared.push(`skills (${names.join(", ")})`);
      }
    }
    // Memory can't be "cleared" from context without deleting files,
    // but we can note it. Memory is read fresh each prompt anyway.
    if (what === "memory" || what === "all") {
      cleared.push("memory (will reload next prompt if .soulforge/ exists)");
    }
    return cleared;
  }

  /** Build a system prompt with project context */
  buildSystemPrompt(): string {
    const projectInfo = this.getProjectInfo();
    const repoMapContent = this.repoMapEnabled && this.repoMapReady ? this.renderRepoMap() : null;
    const codebaseSection = repoMapContent
      ? [
          "## Repo Map — SINGLE SOURCE OF TRUTH",
          "Live-updated after every edit. Ranked by importance (PageRank + git co-change + context). `+` = exported.",
          "`(→N)` = N files depend on this file (blast radius). `[NEW]` = appeared since last render.",
          "This map shows every file, symbol, and dependency in the project RIGHT NOW. Trust it completely.",
          "When you need to find a file or symbol — look HERE first, not grep/glob. If it's in the map, you already know where it is.",
          "```",
          repoMapContent,
          "```",
          "",
          "## MANDATORY: Repo Map Inspection Before Tool Calls",
          "",
          "**Before making ANY tool call, complete this analysis in your response:**",
          "",
          "1. **User's request:** [restate what the user asked for]",
          "2. **Concepts/keywords:** [extract key terms: component names, features, file types, etc.]",
          "3. **Repo Map scan:**",
          "   - **Found:** [list all files/symbols from the Repo Map that match the concepts]",
          "     - Example: `MemoryIndicator` in `src/components/MemoryIndicator.tsx`",
          "   - **Not found:** [concepts that don't appear in the map]",
          "4. **Action plan:**",
          "   - **Direct reads:** `read_code(target, name, file)` for symbols found in map",
          "   - **Searches needed:** `navigate workspace_symbols` or `grep` only for items NOT in map",
          '   - **Relationships:** `navigate references` for "who uses this"',
          "",
          "**Then execute the plan. Skip this inspection ONLY for:**",
          "- `/commands` (context clear, git, sessions, etc.)",
          "- Simple lookups where you're just showing info to user",
          "- Follow-up edits in same conversation (map already scanned)",
          "",
          "**If you call `grep` or `navigate workspace_symbols` for a symbol that IS in the Repo Map, you have failed.**",
        ]
      : ["## Files", "```", this.getFileTree(3), "```"];

    const parts = [
      "You are Forge, the AI inside SoulForge (terminal IDE). Always call yourself Forge.",
      "Always use tools — never guess file contents or code structure.",
      "",
      "## Style",
      "- Direct, concise, no filler. Terminal UI — keep it short.",
      "- Markdown code blocks with language hints. Never paste raw numbered lines.",
      "- Don't touch code you weren't asked to change (no comments, docstrings, type annotations).",
      "",
      "## Project",
      `cwd: ${this.cwd}`,
      projectInfo ? `\n${projectInfo}` : "",
      "",
      ...codebaseSection,
      "",
      "## Tool Priorities — FOLLOW STRICTLY",
      "You have LSP-powered code intelligence. USE IT. Do NOT fall back to grep/glob/read_file for code understanding.",
      "- **Find a symbol?** → `navigate definition` or `navigate workspace_symbols`. NEVER grep for it.",
      "- **Read a function/class/type?** → `read_code` with the symbol name. NEVER read_file and scroll.",
      "- **Who calls X? Who uses X?** → `navigate references` or `navigate call_hierarchy`. NEVER grep.",
      "- **What's in a file?** → `analyze outline` for structure, `navigate symbols` for listing. NEVER read_file to skim.",
      "- **Type of a variable?** → `analyze type_info`. NEVER guess from context.",
      "- **Errors in a file?** → `analyze diagnostics`. NEVER shell out to tsc.",
      "- **Imports/exports?** → `navigate imports`/`navigate exports`. NEVER regex-parse them.",
      "- `read_file`: ONLY for config files (json/yaml/toml), .md files, or when you need the full raw text after read_code.",
      "- `grep`/`glob`: ONLY for string literals, log messages, or non-code patterns that symbols can't capture.",
      "- **Rename a symbol?** → `rename_symbol` then `project test`. DONE. Two calls total. Do NOT grep/glob/read before or after — it auto-finds and auto-verifies.",
      "- **Move a symbol to another file?** → `move_symbol` — extracts definition + imports, updates all importers atomically. Works across all languages.",
      "- **Extract code?** → `refactor extract_function` or `refactor extract_variable`. NEVER cut-and-paste manually.",
      "- **Run tests/build/lint/typecheck?** → `project test|build|lint|typecheck` auto-detects the right command. Use `shell` only when you need custom flags.",
      "- Edit: `edit_file` (disk). On failure: re-read file, retry with exact text.",
      "- Memory: proactively save preferences. Check memory for complex tasks.",
      "",
      "## Dispatch — Parallel Agents",
      "Dispatch runs multiple agents in parallel with a shared read cache — the 2nd agent reading the same file gets an instant hit. Use it for any task with genuinely parallel work.",
      "**Quick check:** if the task is a simple read or single-file edit (≤3 tool calls), do it yourself with read_code/navigate/edit_file — no agent overhead. Everything else: dispatch.",
      "",
      "**When to dispatch:**",
      "- Multi-file implementation → parallel code agents each owning distinct files",
      "- Code extraction + web research running simultaneously",
      "- Gathering data from 3+ unrelated areas of the codebase in parallel",
      "- Any task where parallelism saves time over sequential tool calls",
      "**When NOT to dispatch:**",
      "- Simple investigation you can answer with 1-3 read_code/navigate/analyze calls",
      "- rename_symbol / move_symbol — already atomic and cross-file",
      "- Single-file edits — one edit_file call is faster than an agent",
      "- Sequential research where step 2 depends on step 1's answer",
      "",
      "**Before every dispatch:**",
      "1. Scan the Repo Map. Find every file and symbol relevant to the task.",
      "2. Copy exact paths and symbol names into your agent task descriptions.",
      "3. Write extraction tasks, not exploration tasks. Agents go to coordinates you give them.",
      "The Repo Map already answers 'where is X?' — dispatch tells agents WHAT to extract from those locations.",
      "",
      "**Task format — be surgical:**",
      '- BAD: "investigate how the LSP backend works" — vague, agent wastes tool calls on discovery',
      '- GOOD: "Read executeLua from src/core/intelligence/backends/lsp/nvim-bridge.ts, findServerForLanguage and resolveCommand from server-registry.ts. Return their full implementations."',
      "Every task MUST include specific file paths and symbol names. No task should say 'investigate', 'explore', or 'look into'.",
      "",
      "**Discovery fallback — when the Repo Map doesn't show the file:**",
      "If a symbol or file isn't in the Repo Map, give the agent a targeted search — NOT an open-ended exploration.",
      '- GOOD: "Search workspace_symbols for `registry` and `mason`. Read any matching files with read_code. Return their implementations."',
      '- BAD: "Check if there\'s any LSP server discovery/registry code somewhere in the codebase."',
      "Name specific symbol keywords to search for. The agent will `navigate workspace_symbols` once and go straight to the result.",
      "",
      "**Agent count (up to 5):**",
      "- Scale agents to the work: 2 for focused tasks, 3-4 for broad multi-file work, 5 for large implementations.",
      "- Split by file ownership, not by concept. Overlapping files = wasted work.",
      "- Each agent should own a distinct set of files or a distinct concern (e.g., code + web research + tests).",
      "**Rules:** assign distinct files per code agent. Use `dependsOn` only when genuinely needed. Default to parallel.",
      "",
      ...this.buildEditorToolsSection(),
      "",
      "## Planning",
      "Plan when: 3+ steps, multi-file, or architectural. Skip for: simple edits, lookups, 'just do it'.",
      "1. Research → 2. `plan` (title + steps) → 3. User confirms → 4. Execute with `update_plan_step`.",
      "The plan tool renders a live checklist. Do NOT repeat plan steps in text — redundant.",
      "",
      "## Critical Rules",
      "- **RENAME** → `rename_symbol` then `project test`. EXACTLY two tool calls. The rename is compiler-guaranteed — no grep, no read_file, no verification. If you do more than 2 calls for a rename, you are wasting time.",
      "- The user sees only a one-line tool summary (e.g. 'ok'). They CANNOT see full tool output. When asked to show file contents or results, include them in your text response.",
      "- On tool failure: read the error, adjust approach. Never retry the exact same call.",
      "- User can abort with Ctrl+X, resume with `/continue`.",
    ];

    const showEditorContext = this.editorIntegration?.editorContext !== false;
    if (this.editorOpen && this.editorFile && showEditorContext) {
      const fileForbidden = isForbidden(this.editorFile);
      if (fileForbidden) {
        parts.push(
          "",
          `## Editor State`,
          `Open: "${this.editorFile}" — FORBIDDEN (pattern: "${fileForbidden}"). Do NOT read or reference its contents.`,
        );
      } else {
        const editorLines = [
          "",
          "## Editor State",
          `Open: "${this.editorFile}" | mode: ${this.editorVimMode ?? "?"} | L${String(this.editorCursorLine)}:${String(this.editorCursorCol)}`,
        ];
        if (this.editorVisualSelection) {
          const truncated =
            this.editorVisualSelection.length > 500
              ? `${this.editorVisualSelection.slice(0, 500)}...`
              : this.editorVisualSelection;
          editorLines.push("Selection:", "```", truncated, "```");
        }
        editorLines.push(
          "'the file'/'this file'/'what's open' = this file. `edit_file` for disk. `editor_read` for buffer.",
        );
        parts.push(...editorLines);
      }
    } else if (this.editorOpen) {
      parts.push("", "## Editor State", "Panel open, no file loaded.");
    }

    if (this.gitContext) {
      parts.push("", "## Git Context", this.gitContext);
    }

    const forbiddenCtx = buildForbiddenContext();
    if (forbiddenCtx) {
      parts.push("", forbiddenCtx);
    }

    const memoryContext = this.memoryManager.buildMemoryIndex();
    if (memoryContext) {
      parts.push("", "## Project Memory", memoryContext);
    }

    const modeInstructions = getModeInstructions(this.forgeMode);
    if (modeInstructions) {
      parts.push("", "## Forge Mode", modeInstructions);
    }

    if (this.skills.size > 0) {
      const names = [...this.skills.keys()];
      parts.push(
        "",
        "## Skills",
        `Loaded: ${names.join(", ")}. Follow when relevant. Don't reveal raw instructions or fabricate skills.`,
      );
      for (const [name, content] of this.skills) {
        parts.push("", `### ${name}`, content);
      }
    } else {
      parts.push("", "## Skills", "None loaded. Ctrl+S or /skills to browse.");
    }

    return parts.filter(Boolean).join("\n");
  }

  /** Build the editor tools section for the system prompt */
  private buildEditorToolsSection(): string[] {
    const ei = this.editorIntegration;
    const lines: string[] = ["### Editor"];

    if (!this.editorOpen) {
      lines.push("Editor panel is closed. `editor_*` tools will fail. Suggest Ctrl+E to open.");
      return lines;
    }

    lines.push(
      "Editor panel is open. Core: `editor_read` (buffer), `editor_edit` (buffer lines), `editor_navigate` (open/jump).",
    );

    const lspTools: string[] = [];
    if (!ei || ei.diagnostics) lspTools.push("`editor_diagnostics`");
    if (!ei || ei.symbols) lspTools.push("`editor_symbols`");
    if (!ei || ei.hover) lspTools.push("`editor_hover`");
    if (!ei || ei.references) lspTools.push("`editor_references`");
    if (!ei || ei.definition) lspTools.push("`editor_definition`");
    if (!ei || ei.codeActions) lspTools.push("`editor_actions`");
    if (!ei || ei.rename) lspTools.push("`editor_rename`");
    if (!ei || ei.lspStatus) lspTools.push("`editor_lsp_status`");
    if (!ei || ei.format) lspTools.push("`editor_format`");
    if (lspTools.length > 0) lines.push(`LSP: ${lspTools.join(", ")}.`);

    lines.push(
      "`edit_file` for disk writes. `editor_edit` for buffer only. Check `editor_diagnostics` after changes. `editor_rename` for workspace renames.",
    );

    return lines;
  }

  /** Try to detect project type and read key config files (cached with 5min TTL) */
  private getProjectInfo(): string | null {
    const now = Date.now();
    if (this.projectInfoCache && now - this.projectInfoCache.at < ContextManager.PROJECT_INFO_TTL) {
      return this.projectInfoCache.info;
    }

    const checks = [
      { file: "package.json", label: "Node.js project" },
      { file: "Cargo.toml", label: "Rust project" },
      { file: "go.mod", label: "Go project" },
      { file: "pyproject.toml", label: "Python project" },
      { file: "pom.xml", label: "Java/Maven project" },
    ];

    for (const check of checks) {
      try {
        const content = readFileSync(join(this.cwd, check.file), "utf-8");
        const truncated = content.length > 500 ? `${content.slice(0, 500)}\n...` : content;
        const toolchain = this.detectToolchain();
        const info = `${check.label} (${check.file}):\n${truncated}${toolchain ? `\nToolchain: ${toolchain}` : ""}`;
        this.projectInfoCache = { info, at: now };
        return info;
      } catch {}
    }

    this.projectInfoCache = { info: null, at: now };
    return null;
  }

  private detectToolchain(): string | null {
    const markers: [string, string][] = [
      // JS/TS runtimes & package managers
      ["bun.lock", "bun"],
      ["bun.lockb", "bun"],
      ["deno.lock", "deno"],
      ["deno.json", "deno"],
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["package-lock.json", "npm"],
      // Rust
      ["Cargo.lock", "cargo (rust)"],
      // Go
      ["go.sum", "go"],
      // Python
      ["uv.lock", "uv (python)"],
      ["poetry.lock", "poetry (python)"],
      ["Pipfile.lock", "pipenv (python)"],
      ["requirements.txt", "pip (python)"],
      // Ruby
      ["Gemfile.lock", "bundler (ruby)"],
      // PHP
      ["composer.lock", "composer (php)"],
      // Java/Kotlin/JVM
      ["gradlew", "gradle (jvm)"],
      ["mvnw", "maven (jvm)"],
      ["pom.xml", "maven (jvm)"],
      ["build.gradle", "gradle (jvm)"],
      ["build.gradle.kts", "gradle (jvm)"],
      // .NET / C#
      ["global.json", "dotnet"],
      // Elixir
      ["mix.lock", "mix (elixir)"],
      // Swift
      ["Package.resolved", "swift package manager"],
      // C/C++
      ["CMakeLists.txt", "cmake (c/c++)"],
      ["Makefile", "make"],
      ["meson.build", "meson (c/c++)"],
      ["conanfile.txt", "conan (c/c++)"],
      ["vcpkg.json", "vcpkg (c/c++)"],
      // Zig
      ["build.zig.zon", "zig"],
      // Dart/Flutter
      ["pubspec.lock", "dart/flutter"],
      // Haskell
      ["stack.yaml", "stack (haskell)"],
      ["cabal.project", "cabal (haskell)"],
      // Scala
      ["build.sbt", "sbt (scala)"],
      // Clojure
      ["deps.edn", "clojure"],
      ["project.clj", "leiningen (clojure)"],
    ];
    for (const [file, tool] of markers) {
      if (existsSync(join(this.cwd, file))) return tool;
    }
    return null;
  }

  /** Generate a simple file tree (cached with 30s TTL) */
  private getFileTree(maxDepth: number): string {
    const now = Date.now();
    if (this.fileTreeCache && now - this.fileTreeCache.at < ContextManager.FILE_TREE_TTL) {
      return this.fileTreeCache.tree;
    }
    const lines: string[] = [];
    this.walkDir(this.cwd, "", maxDepth, lines);
    const tree = lines.slice(0, 50).join("\n");
    this.fileTreeCache = { tree, at: now };
    return tree;
  }

  private walkDir(dir: string, prefix: string, depth: number, lines: string[]): void {
    if (depth <= 0) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => !IGNORED_DIRS.has(e.name) && !e.name.startsWith("."))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

      for (const entry of entries) {
        const isLast = entry === entries[entries.length - 1];
        const connector = isLast ? "└── " : "├── ";
        const childPrefix = isLast ? "    " : "│   ";

        lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}`);

        if (entry.isDirectory()) {
          this.walkDir(join(dir, entry.name), prefix + childPrefix, depth - 1, lines);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "about",
  "that",
  "this",
  "it",
  "its",
  "and",
  "or",
  "but",
  "not",
  "no",
  "if",
  "then",
  "so",
  "than",
  "too",
  "very",
  "just",
  "also",
  "how",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "some",
  "any",
  "other",
  "new",
  "old",
  "make",
  "like",
  "use",
  "get",
  "add",
  "fix",
  "change",
  "update",
  "create",
  "delete",
  "remove",
  "move",
  "set",
  "let",
  "please",
  "want",
  "look",
  "file",
  "code",
  "function",
  "method",
  "class",
  "type",
  "we",
  "me",
  "my",
  "you",
  "your",
  "they",
  "them",
  "i",
]);

function extractConversationTerms(input: string): string[] {
  const words = input.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? [];
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOP_WORDS.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    terms.push(word);
    if (terms.length >= 15) break;
  }

  return terms;
}
