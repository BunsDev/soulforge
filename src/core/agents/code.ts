import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { hasToolCall, stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { buildSubagentCodeTools, wrapWithBusCache } from "../tools/index.js";
import type { AgentBus } from "./agent-bus.js";
import { buildBusTools } from "./bus-tools.js";
import { buildPrepareStep, tokenBudget } from "./step-utils.js";

const CODE_BASE = `Code agent. Surgical reads, targeted edits, zero waste.
You have LSP-powered code intelligence — USE IT instead of grep/glob/read_file.
- Find symbol → navigate definition/workspace_symbols. NEVER grep.
- Read function/class → read_code with symbol name. NEVER read_file and scroll.
- Who calls/uses X → navigate references/call_hierarchy. NEVER grep.
- File structure → analyze outline. Errors → analyze diagnostics.
- Rename symbol → rename_symbol (auto-locates, renames across ALL files in one call). NEVER use edit_file for renames.
- read_file: ONLY for config (json/yaml) or full raw text after read_code.
- grep/glob: ONLY for string literals or non-code patterns.
Edit: edit_file for changes, shell for commands. Rename: rename_symbol (atomic, cross-file). Verify: analyze diagnostics or shell (lint/typecheck), then done.
On edit failure ('old_string not found'): re-read file with read_file, retry with exact text. Never retry the same edit blindly.

WORKFLOW: Your task includes specific file paths and symbols to edit. Go directly to those targets — read_code to understand the current code, then edit_file to make changes. Do NOT grep/glob to rediscover locations already given to you. If the repo map is appended below, use it to find related code (callers, importers) without extra discovery steps.
DISCOVERY: If your task names symbols or keywords but NOT file paths, run one navigate workspace_symbols call with the keyword, then read_code on the result. If workspace_symbols returns nothing, fall back to grep for the symbol name across the codebase. One search, one read — never chain multiple discovery tools for the same target.

OUTPUT CONTRACT: Your done call must report concrete results. For edits: exact file paths, what changed, verification output. For research portions: actual code excerpts and type signatures, not descriptions. The parent agent cannot see your tool results — only what you put in the done call.`;

const CODE_INSTRUCTIONS = CODE_BASE;

const CODE_BUS_INSTRUCTIONS = `${CODE_BASE}
Ownership: you own files you edit first. check_edit_conflicts before touching another agent's file.
If another agent owns the file: report_finding with the exact edit instead.
Coordination: report_finding after significant changes (paths, what changed, new exports). Peer findings appear in tool results.`;

const ANTHROPIC_CACHE = {
  anthropic: { cacheControl: { type: "ephemeral" } },
} as const;

const codeDoneTool = tool({
  description:
    "Call this when your coding task is complete. Provide a structured summary of changes made.",
  inputSchema: z.object({
    summary: z.string().describe("Concise summary of changes"),
    filesEdited: z
      .array(
        z.object({
          file: z.string(),
          changes: z.string().describe("What was changed"),
        }),
      )
      .describe("Files modified with descriptions"),
    verified: z.boolean().describe("Whether changes were verified (lint/typecheck/test)"),
    verificationOutput: z.string().optional().describe("Output from verification commands"),
  }),
});

interface CodeAgentOptions {
  bus?: AgentBus;
  agentId?: string;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
  webSearchModel?: LanguageModel;
  onApproveWebSearch?: (query: string) => Promise<boolean>;
  repoMapContext?: string;
}

export function createCodeAgent(model: LanguageModel, options?: CodeAgentOptions) {
  const bus = options?.bus;
  const agentId = options?.agentId;
  const hasBus = !!(bus && agentId);
  const busTools = hasBus ? buildBusTools(bus, agentId, "code") : {};

  let tools = buildSubagentCodeTools({
    webSearchModel: options?.webSearchModel,
    onApproveWebSearch: options?.onApproveWebSearch,
  });
  if (hasBus) {
    tools = wrapWithBusCache(tools, bus, agentId) as typeof tools;
  }

  const allTools = {
    ...tools,
    ...busTools,
    done: codeDoneTool,
  };

  return new ToolLoopAgent({
    id: options?.agentId ?? "code",
    model,
    tools: allTools,
    instructions: {
      role: "system" as const,
      content:
        (hasBus ? CODE_BUS_INSTRUCTIONS : CODE_INSTRUCTIONS) +
        (options?.repoMapContext
          ? `\n\nRepo map (ranked by importance, + = exported):\n${options.repoMapContext}`
          : ""),
      providerOptions: ANTHROPIC_CACHE,
    },
    stopWhen: [stepCountIs(25), tokenBudget(150_000), hasToolCall("done")],
    prepareStep: buildPrepareStep({ bus, agentId, role: "code", allTools }),
    ...(options?.providerOptions && Object.keys(options.providerOptions).length > 0
      ? { providerOptions: options.providerOptions }
      : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}
