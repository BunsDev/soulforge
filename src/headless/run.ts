import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createForgeAgent } from "../core/agents/index.js";
import { ContextManager } from "../core/context/manager.js";
import { resolveModel } from "../core/llm/provider.js";
import { buildProviderOptions } from "../core/llm/provider-options.js";
import { SessionManager } from "../core/sessions/manager.js";
import type { AppConfig, ChatMessage } from "../types/index.js";
import { DIM, EXIT_ABORT, EXIT_ERROR, EXIT_OK, EXIT_TIMEOUT, PURPLE, RST } from "./constants.js";
import {
  formatDuration,
  formatTokens,
  separator,
  stderrDim,
  stderrError,
  stderrLabel,
  stderrWarn,
  writeEvent,
} from "./output.js";
import type { HeadlessRunOptions } from "./types.js";

export async function runPrompt(opts: HeadlessRunOptions, merged: AppConfig): Promise<void> {
  const startTime = Date.now();
  const cwd = opts.cwd ?? process.cwd();
  const mode = opts.mode ?? "default";
  const isQuiet = opts.quiet === true;
  const isEvents = opts.events === true;
  const showProgress = !opts.json && !isEvents && !isQuiet;

  // ── Resolve model ──

  const modelId = opts.modelId ?? merged.defaultModel;
  if (modelId === "none") {
    stderrError("No model configured. Pass --model provider/model or set defaultModel in config.");
    process.exit(EXIT_ERROR);
  }

  const model = resolveModel(modelId);
  const providerOpts = buildProviderOptions(modelId, merged);

  // ── Context manager ──

  const contextManager = await ContextManager.createAsync(cwd, (step) => {
    if (showProgress) stderrDim(step);
  });

  // ── Repo map ──

  if (!opts.noRepomap) {
    const REPO_MAP_TIMEOUT = 15_000;
    if (!contextManager.isRepoMapReady()) {
      const start = Date.now();
      while (Date.now() - start < REPO_MAP_TIMEOUT) {
        await new Promise((r) => setTimeout(r, 200));
        if (contextManager.isRepoMapReady()) break;
      }
    }
  }

  const repoMap =
    !opts.noRepomap && contextManager.isRepoMapReady() ? contextManager.getRepoMap() : undefined;

  // ── Instructions ──

  const { loadInstructions, buildInstructionPrompt } = await import("../core/instructions.js");
  const instructions = loadInstructions(cwd, merged.instructionFiles);
  let instructionText = buildInstructionPrompt(instructions);
  if (opts.system) {
    instructionText = instructionText ? `${instructionText}\n\n${opts.system}` : opts.system;
  }
  contextManager.setProjectInstructions(instructionText);

  if (mode !== "default") contextManager.setForgeMode(mode);

  // ── Intelligence warmup ──

  try {
    const { warmupIntelligence } = await import("../core/intelligence/index.js");
    warmupIntelligence(cwd, merged.codeIntelligence);
  } catch {}

  // ── Abort / timeout ──

  const abortController = new AbortController();
  let timedOut = false;
  let exitCode = EXIT_OK;

  process.on("SIGINT", () => abortController.abort());

  if (opts.timeout) {
    setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, opts.timeout);
  }

  // ── Session resume ──

  let priorMessages: import("ai").ModelMessage[] = [];
  let priorChatMessages: ChatMessage[] = [];
  const sessionManager = new SessionManager(cwd);

  if (opts.sessionId) {
    const fullId = sessionManager.findByPrefix(opts.sessionId);
    if (!fullId) {
      stderrError(`Session "${opts.sessionId}" not found`);
      process.exit(EXIT_ERROR);
    }
    const data = sessionManager.loadSessionMessages(fullId);
    if (data) {
      priorMessages = data.coreMessages;
      priorChatMessages = data.messages;
      if (showProgress) {
        stderrDim(
          `Resumed session ${fullId.slice(0, 8)} (${String(data.messages.length)} messages)`,
        );
      }
    }
  }

  // ── Include files ──

  let prompt = opts.prompt;
  if (opts.include && opts.include.length > 0) {
    const fileParts: string[] = [];
    for (const file of opts.include) {
      const fullPath = resolve(cwd, file);
      if (!existsSync(fullPath)) {
        stderrWarn(`--include file not found: ${file}`);
        continue;
      }
      try {
        fileParts.push(`[${file}]\n${readFileSync(fullPath, "utf-8")}`);
      } catch {}
    }
    if (fileParts.length > 0) {
      prompt = `${fileParts.join("\n\n")}\n\n${prompt}`;
    }
  }

  // ── Create agent ──

  const agent = createForgeAgent({
    model,
    contextManager,
    forgeMode: mode,
    editorIntegration: {
      diagnostics: false,
      symbols: false,
      hover: false,
      references: false,
      definition: false,
      codeActions: false,
      editorContext: false,
      rename: false,
      lspStatus: false,
      format: false,
    },
    providerOptions: providerOpts.providerOptions,
    headers: providerOpts.headers,
    cwd,
  });

  contextManager.updateConversationContext(prompt, 0);

  // ── Header ──

  if (isEvents) {
    writeEvent({
      type: "start",
      model: modelId,
      mode,
      session: opts.sessionId ?? null,
      repoMap: repoMap
        ? { files: repoMap.getStats().files, symbols: repoMap.getStats().symbols }
        : null,
    });
  } else if (showProgress) {
    stderrLabel("Model", modelId);
    if (mode !== "default") stderrLabel("Mode", mode);
    if (repoMap) {
      const stats = repoMap.getStats();
      stderrLabel("Repo", `${String(stats.files)} files, ${String(stats.symbols)} symbols`);
    }
    separator();
  }

  // ── Stream ──

  let output = "";
  let steps = 0;
  const tokens = { input: 0, output: 0, cacheRead: 0 };
  const toolCalls: string[] = [];
  const filesEdited = new Set<string>();
  let error: string | undefined;

  try {
    const messages: import("ai").ModelMessage[] = [
      ...priorMessages,
      { role: "user" as const, content: prompt },
    ];

    const result = await agent.stream({
      messages,
      options: { userMessage: prompt },
      abortSignal: abortController.signal,
    });

    for await (const part of result.fullStream) {
      if (opts.maxSteps && steps >= opts.maxSteps) {
        abortController.abort();
        error = `Max steps reached (${String(opts.maxSteps)})`;
        exitCode = EXIT_ERROR;
        if (showProgress) stderrWarn(`\n${error}`);
        if (isEvents) writeEvent({ type: "error", error });
        break;
      }

      if (part.type === "text-delta") {
        output += part.text;
        if (isEvents) {
          writeEvent({ type: "text", content: part.text });
        } else if (!opts.json) {
          process.stdout.write(part.text);
        }
      } else if (part.type === "tool-call") {
        toolCalls.push(part.toolName);
        if (isEvents) {
          writeEvent({ type: "tool-call", tool: part.toolName });
        } else if (showProgress) {
          process.stderr.write(`${DIM}  ▸ ${part.toolName}${RST}\n`);
        }
        const input = (part as { input?: Record<string, unknown> }).input;
        if (
          input?.path &&
          typeof input.path === "string" &&
          (part.toolName === "edit_file" ||
            part.toolName === "write_file" ||
            part.toolName === "create_file" ||
            part.toolName === "multi_edit")
        ) {
          filesEdited.add(input.path);
        }
      } else if (part.type === "tool-result") {
        if (isEvents) {
          const raw = part.output;
          let summary: string;
          if (raw && typeof raw === "object" && "output" in raw) {
            const out = String((raw as Record<string, unknown>).output);
            summary = out.length > 200 ? `${out.slice(0, 200)}…` : out;
          } else {
            summary = String(raw).slice(0, 200);
          }
          writeEvent({ type: "tool-result", tool: part.toolName, summary });
        }
      } else if (part.type === "finish-step") {
        steps++;
        const usage = part.usage as {
          inputTokens?: number;
          outputTokens?: number;
          inputTokenDetails?: { cacheReadTokens?: number };
        };
        tokens.input += usage.inputTokens ?? 0;
        tokens.output += usage.outputTokens ?? 0;
        tokens.cacheRead += usage.inputTokenDetails?.cacheReadTokens ?? 0;
        if (isEvents) {
          writeEvent({ type: "step", step: steps, tokens: { ...tokens } });
        }
      }
    }
  } catch (err) {
    if (timedOut) {
      error = `Timeout after ${String(Math.round((opts.timeout ?? 0) / 1000))}s`;
      exitCode = EXIT_TIMEOUT;
    } else if (abortController.signal.aborted) {
      error = "Aborted by user";
      exitCode = EXIT_ABORT;
    } else {
      error = err instanceof Error ? err.message : String(err);
      exitCode = EXIT_ERROR;
    }
    if (showProgress) stderrError(error);
    if (isEvents) writeEvent({ type: "error", error });
  }

  const duration = Date.now() - startTime;
  const edited = [...filesEdited];

  // ── Session save ──

  if (opts.saveSession) {
    const sessionId = crypto.randomUUID();
    const chatMessages: ChatMessage[] = [
      ...priorChatMessages,
      { id: crypto.randomUUID(), role: "user", content: prompt, timestamp: startTime },
      { id: crypto.randomUUID(), role: "assistant", content: output, timestamp: Date.now() },
    ];
    sessionManager.saveSession(
      {
        id: sessionId,
        title: SessionManager.deriveTitle(chatMessages),
        cwd,
        startedAt:
          priorChatMessages.length > 0 ? (priorChatMessages[0]?.timestamp ?? startTime) : startTime,
        updatedAt: Date.now(),
        activeTabId: "headless",
        forgeMode: mode,
        tabs: [
          {
            id: "headless",
            label: "Headless",
            activeModel: modelId,
            sessionId,
            planMode: false,
            planRequest: null,
            coAuthorCommits: false,
            tokenUsage: {
              prompt: tokens.input,
              completion: tokens.output,
              total: tokens.input + tokens.output,
              cacheRead: tokens.cacheRead,
            },
            messageRange: { startLine: 0, endLine: chatMessages.length },
          },
        ],
      },
      new Map([["headless", chatMessages]]),
    );
    if (showProgress) stderrDim(`Session saved: ${sessionId.slice(0, 8)}`);
    if (isEvents) writeEvent({ type: "session-saved", sessionId });
  }

  // ── Output ──

  if (isEvents) {
    writeEvent({
      type: "done",
      output,
      steps,
      tokens,
      toolCalls,
      filesEdited: edited,
      duration,
      ...(error ? { error } : {}),
    });
  } else if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          model: modelId,
          mode,
          prompt,
          output,
          steps,
          tokens,
          toolCalls,
          filesEdited: edited,
          duration,
          ...(error ? { error } : {}),
        },
        null,
        2,
      )}\n`,
    );
  } else {
    if (output.length > 0 && !output.endsWith("\n")) process.stdout.write("\n");
    if (!isQuiet) {
      if (edited.length > 0 && opts.diff) {
        separator();
        process.stderr.write(`${PURPLE}Files changed:${RST}\n`);
        for (const f of edited) process.stderr.write(`  ${f}\n`);
      }
      separator();
      process.stderr.write(
        `${DIM}${String(steps)} steps — ${formatTokens(tokens)} — ${formatDuration(duration)}${RST}\n`,
      );
    }
  }

  contextManager.dispose();
  process.exit(exitCode);
}
