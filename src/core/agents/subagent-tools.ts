import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { logBackgroundError } from "../../stores/errors.js";
import { projectTool } from "../tools/project.js";
import { AgentBus, type AgentTask, type SharedCache } from "./agent-bus.js";
import { createCodeAgent } from "./code.js";
import { createExploreAgent } from "./explore.js";
import { emitAgentStats, emitMultiAgentEvent, emitSubagentStep } from "./subagent-events.js";

export interface SharedCacheRef {
  current: SharedCache | undefined;
  updateFile(path: string, content: string): void;
}

interface SubagentModels {
  defaultModel: LanguageModel;
  explorationModel?: LanguageModel;
  codingModel?: LanguageModel;
  webSearchModel?: LanguageModel;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
  onApproveWebSearch?: (query: string) => Promise<boolean>;
  readOnly?: boolean;
  repoMapContext?: string;
  sharedCacheRef?: SharedCacheRef;
}

function formatToolArgs(toolCall: { toolName: string; input?: unknown }): string {
  const a = (toolCall.input ?? {}) as Record<string, unknown>;
  if (toolCall.toolName === "read_file" && a.path) return String(a.path);
  if (toolCall.toolName === "grep" && a.pattern) return `/${String(a.pattern)}/`;
  if (toolCall.toolName === "glob" && a.pattern) return String(a.pattern);
  if (toolCall.toolName === "shell" && a.command) {
    const cmd = String(a.command);
    return cmd.length > 50 ? `${cmd.slice(0, 47)}...` : cmd;
  }
  if (toolCall.toolName === "edit_file" && a.path) return String(a.path);
  if (toolCall.toolName === "project" && a.action) {
    const parts = [a.action, a.file].filter(Boolean).map(String);
    return parts.join(" ");
  }
  if (toolCall.toolName === "rename_symbol" && a.symbol) {
    return `${String(a.symbol)} → ${String(a.newName ?? "")}`;
  }
  if (toolCall.toolName === "move_symbol" && a.symbol) {
    return `${String(a.symbol)} → ${String(a.to ?? "")}`;
  }
  return "";
}

/** Build step-reporting callbacks for a subagent */
function buildStepCallbacks(parentToolCallId: string, agentId?: string) {
  const acc = { toolUses: 0, input: 0, output: 0, cacheRead: 0 };

  return {
    experimental_onToolCallStart: (event: { toolCall?: { toolName: string; input?: unknown } }) => {
      const tc = event.toolCall;
      if (!tc) return;
      emitSubagentStep({
        parentToolCallId,
        toolName: tc.toolName,
        args: formatToolArgs(tc),
        state: "running",
        agentId,
      });
    },
    experimental_onToolCallFinish: (event: {
      toolCall?: { toolName: string; input?: unknown };
      output?: unknown;
      result?: unknown;
      success?: boolean;
    }) => {
      const tc = event.toolCall;
      if (!tc) return;
      let backend: string | undefined;
      const res = event.output ?? event.result;
      if (res && typeof res === "object") {
        const b = (res as Record<string, unknown>).backend;
        if (typeof b === "string") backend = b;
      }
      emitSubagentStep({
        parentToolCallId,
        toolName: tc.toolName,
        args: formatToolArgs(tc),
        state: event.success ? "done" : "error",
        agentId,
        backend,
      });
    },
    onStepFinish: (step: {
      toolCalls?: unknown[];
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        inputTokenDetails?: { cacheReadTokens?: number };
      };
    }) => {
      acc.toolUses += step.toolCalls?.length ?? 0;
      acc.input += step.usage?.inputTokens ?? 0;
      acc.output += step.usage?.outputTokens ?? 0;
      acc.cacheRead += step.usage?.inputTokenDetails?.cacheReadTokens ?? 0;
      if (agentId) {
        emitAgentStats({
          parentToolCallId,
          agentId,
          toolUses: acc.toolUses,
          tokenUsage: { input: acc.input, output: acc.output, total: acc.input + acc.output },
          cacheHits: acc.cacheRead,
        });
      }
    },
    _acc: acc,
  };
}

function autoPostCompletionSummary(bus: AgentBus, task: AgentTask): void {
  const readMap = bus.getFilesRead(task.agentId);
  const readFiles = readMap.get(task.agentId) ?? [];
  const editedMap = bus.getEditedFiles(task.agentId);
  const editedFiles = [...editedMap.keys()];

  if (readFiles.length === 0 && editedFiles.length === 0) return;

  const parts: string[] = [];
  if (readFiles.length > 0) parts.push(`Read: ${readFiles.join(", ")}`);
  if (editedFiles.length > 0) parts.push(`Edited: ${editedFiles.join(", ")}`);

  bus.postFinding({
    agentId: task.agentId,
    label: `${task.agentId} completed — ${String(readFiles.length)} files read, ${String(editedFiles.length)} edited`,
    content: parts.join("\n"),
    timestamp: Date.now(),
  });
}

interface DoneToolResult {
  summary: string;
  filesEdited?: Array<{ file: string; changes: string }>;
  filesExamined?: string[];
  keyFindings?: Array<{ file: string; detail: string; lineNumbers?: string }>;
  verified?: boolean;
  verificationOutput?: string;
}

type AgentResult = {
  text: string;
  steps: Array<{
    toolCalls?: Array<{ toolName: string; args?: Record<string, unknown> }>;
    toolResults?: Array<{
      toolName: string;
      input?: unknown;
      output?: unknown;
    }>;
  }>;
};

function extractDoneResult(result: AgentResult): DoneToolResult | null {
  for (let i = result.steps.length - 1; i >= 0; i--) {
    const step = result.steps[i];
    const doneCall = step?.toolCalls?.find((tc) => tc.toolName === "done");
    if (doneCall?.args) return doneCall.args as unknown as DoneToolResult;
  }
  return null;
}

const RESULT_TOOLS = new Set([
  "read_file",
  "read_code",
  "grep",
  "navigate",
  "analyze",
  "web_search",
]);
const TOOL_RESULT_CAP = 2000;
const TOTAL_TOOL_RESULTS_CAP = 8000;

function buildFallbackResult(result: AgentResult): string {
  const filesRead = new Set<string>();
  const filesEdited = new Set<string>();
  const toolOutputs: string[] = [];
  let toolOutputChars = 0;

  for (const step of result.steps) {
    for (const tc of step.toolCalls ?? []) {
      const path = tc.args?.path as string | undefined;
      if (path) {
        if (tc.toolName === "read_file" || tc.toolName === "read_code") filesRead.add(path);
        if (tc.toolName === "edit_file") filesEdited.add(path);
      }
    }

    for (const tr of step.toolResults ?? []) {
      if (!RESULT_TOOLS.has(tr.toolName)) continue;
      if (toolOutputChars >= TOTAL_TOOL_RESULTS_CAP) break;

      const raw =
        typeof tr.output === "string"
          ? tr.output
          : tr.output != null
            ? JSON.stringify(tr.output)
            : null;
      if (!raw || raw.length < 10) continue;

      const inp = tr.input as Record<string, unknown> | null | undefined;
      const label = inp?.path
        ? `${tr.toolName}(${String(inp.path)})`
        : inp?.pattern
          ? `${tr.toolName}(${String(inp.pattern)})`
          : inp?.query
            ? `${tr.toolName}(${String(inp.query)})`
            : tr.toolName;

      const content = raw.length > TOOL_RESULT_CAP ? `${raw.slice(0, TOOL_RESULT_CAP)}...` : raw;
      toolOutputs.push(`[${label}]\n${content}`);
      toolOutputChars += content.length;
    }
  }

  const parts: string[] = [];
  const text = result.text.trim();
  if (text) {
    const cap = toolOutputs.length > 0 ? 2000 : 6000;
    parts.push(text.length > cap ? `${text.slice(0, cap)}...` : text);
  }
  if (filesEdited.size > 0) parts.push(`Files edited: ${[...filesEdited].join(", ")}`);
  if (filesRead.size > 0) parts.push(`Files examined: ${[...filesRead].join(", ")}`);
  if (toolOutputs.length > 0) {
    parts.push("Tool outputs:", ...toolOutputs);
  }
  return parts.join("\n") || "(no output)";
}

function formatDoneResult(done: DoneToolResult): string {
  const parts: string[] = [done.summary];

  if (done.filesEdited && done.filesEdited.length > 0) {
    parts.push("Files edited:", ...done.filesEdited.map((f) => `- ${f.file}: ${f.changes}`));
  }
  if (done.filesExamined && done.filesExamined.length > 0) {
    parts.push(`Files examined: ${done.filesExamined.join(", ")}`);
  }
  if (done.keyFindings && done.keyFindings.length > 0) {
    parts.push(
      "Key findings:",
      ...done.keyFindings.map(
        (f) => `- ${f.file}${f.lineNumbers ? `:${f.lineNumbers}` : ""}: ${f.detail}`,
      ),
    );
  }
  if (done.verified != null) {
    parts.push(`Verified: ${done.verified ? "yes" : "no"}`);
    if (done.verificationOutput) parts.push(done.verificationOutput);
  }

  return parts.join("\n");
}

async function runEvaluator(
  bus: AgentBus,
  tasks: AgentTask[],
  parentToolCallId: string,
): Promise<string | null> {
  const codeAgents = tasks.filter((t) => t.role === "code");
  if (codeAgents.length === 0) return null;

  const editedFiles = bus.getEditedFiles();
  if (editedFiles.size === 0) return null;

  emitMultiAgentEvent({
    parentToolCallId,
    type: "dispatch-eval",
    totalAgents: tasks.length,
  });

  try {
    const result = await projectTool.execute({
      action: "typecheck",
      timeout: 30_000,
    });

    if (result.success) return null;
    if (
      !result.output ||
      result.output === "No typecheck command detected for this project. Use shell to run manually."
    )
      return null;

    const editedPaths = [...editedFiles.keys()];
    const relevantErrors = result.output
      .split("\n")
      .filter((l: string) => editedPaths.some((p) => l.includes(p)));

    if (relevantErrors.length === 0) return null;

    return `\n\n### Post-dispatch validation\n⚠ Errors in edited files:\n${relevantErrors.join("\n")}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logBackgroundError("post-dispatch-eval", msg);
    return null;
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

function isRetryable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes("overloaded") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("529") ||
    lower.includes("503") ||
    lower.includes("too many requests") ||
    lower.includes("capacity")
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Run a single agent task with retry + exponential backoff for transient errors.
 */
async function runAgentTask(
  task: AgentTask,
  models: SubagentModels,
  bus: AgentBus,
  parentToolCallId: string,
  totalAgents: number,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (task.dependsOn && task.dependsOn.length > 0) {
    await Promise.all(task.dependsOn.map((dep) => bus.waitForAgent(dep)));
  }

  emitMultiAgentEvent({
    parentToolCallId,
    type: "agent-start",
    agentId: task.agentId,
    role: task.role,
    task: task.task,
    totalAgents,
  });

  const peerFindings = bus.summarizeFindings(task.agentId);
  const depResults = task.dependsOn
    ?.map((dep) => {
      const r = bus.getResult(dep);
      return r ? `[${dep}] completed:\n${r.result}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  const peerObjectives = bus.getPeerObjectives(task.agentId);

  const failedDeps =
    task.dependsOn?.filter((dep) => {
      const r = bus.getResult(dep);
      return r && !r.success;
    }) ?? [];

  let enrichedPrompt = task.task;
  if (peerObjectives) {
    enrichedPrompt += `\n\n--- Peer agents ---\n${peerObjectives}`;
  }
  if (depResults) {
    enrichedPrompt += `\n\n--- Dependency results ---\n${depResults}`;
    if (failedDeps.length > 0) {
      enrichedPrompt += `\n\nWARNING: ${failedDeps.join(", ")} failed. Adapt your approach.`;
    }
  }
  if (peerFindings !== "No findings from peer agents yet.") {
    enrichedPrompt += `\n\n--- Peer findings so far ---\n${peerFindings}`;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (abortSignal?.aborted) break;

    if (attempt > 0) {
      const jitter = Math.random() * 1000;
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) + jitter, abortSignal);
      if (abortSignal?.aborted) break;
    }

    try {
      const useExplore = task.role === "explore" || models.readOnly === true;
      const agent = useExplore
        ? createExploreAgent(models.explorationModel ?? models.defaultModel, {
            bus,
            agentId: task.agentId,
            providerOptions: models.providerOptions,
            headers: models.headers,
            webSearchModel: models.webSearchModel,
            onApproveWebSearch: models.onApproveWebSearch,
            repoMapContext: models.repoMapContext,
          })
        : createCodeAgent(models.codingModel ?? models.defaultModel, {
            bus,
            agentId: task.agentId,
            providerOptions: models.providerOptions,
            headers: models.headers,
            webSearchModel: models.webSearchModel,
            onApproveWebSearch: models.onApproveWebSearch,
            repoMapContext: models.repoMapContext,
          });

      const callbacks = buildStepCallbacks(parentToolCallId, task.agentId);

      const result = await agent.generate({
        prompt: enrichedPrompt,
        abortSignal,
        ...callbacks,
      });

      const toolUses =
        callbacks._acc.toolUses ||
        result.steps.reduce((sum, s) => sum + (s.toolCalls?.length ?? 0), 0);
      const input = callbacks._acc.input || (result.totalUsage.inputTokens ?? 0);
      const output = callbacks._acc.output || (result.totalUsage.outputTokens ?? 0);
      const cacheRead =
        callbacks._acc.cacheRead || (result.totalUsage.inputTokenDetails?.cacheReadTokens ?? 0);

      const doneResult = extractDoneResult(result);
      const resultText = doneResult ? formatDoneResult(doneResult) : buildFallbackResult(result);

      bus.setResult({
        agentId: task.agentId,
        role: task.role,
        task: task.task,
        result: resultText,
        success: true,
      });

      autoPostCompletionSummary(bus, task);

      emitMultiAgentEvent({
        parentToolCallId,
        type: "agent-done",
        agentId: task.agentId,
        role: task.role,
        task: task.task,
        totalAgents,
        completedAgents: bus.completedAgentIds.length,
        findingCount: bus.findingCount,
        toolUses,
        tokenUsage: { input, output, total: input + output },
        cacheHits: cacheRead > 0 ? cacheRead : undefined,
        resultChars: resultText.length,
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES) break;
    }
  }

  const errMsg =
    `Failed after ${String(MAX_RETRIES)} attempts. ` +
    `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`;

  bus.setResult({
    agentId: task.agentId,
    role: task.role,
    task: task.task,
    result: errMsg,
    success: false,
    error: errMsg,
  });

  emitMultiAgentEvent({
    parentToolCallId,
    type: "agent-error",
    agentId: task.agentId,
    role: task.role,
    task: task.task,
    totalAgents,
    error: errMsg,
  });
}

/**
 * Unified `dispatch` tool — replaces explore, code, and multi_agent.
 * Handles 1–10 agents with a minimal schema.
 */
export function buildSubagentTools(models: SubagentModels) {
  const cacheRef: SharedCacheRef = models.sharedCacheRef ?? {
    current: undefined,
    updateFile() {},
  };

  return {
    dispatch: tool({
      description:
        "Dispatch parallel subagents. Agents share a read cache — no duplicated work. " +
        "BEFORE writing tasks: scan the Repo Map, find exact file paths and symbol names, put them in each task. " +
        'Task format: "Read [symbol] from [path], [symbol] from [path]. Return their implementations." ' +
        "Every task MUST name specific files and symbols — never write 'investigate' or 'explore the X system'. " +
        "Discovery fallback: if a file isn't in the Repo Map, give the agent specific symbol keywords to search via workspace_symbols — NOT open-ended exploration. " +
        "2 agents handles most tasks. Split by file ownership, not concept. " +
        "explore: read-only extraction. code: edits (assign distinct files per agent). " +
        "dependsOn: only when one agent genuinely needs another's output.",
      inputSchema: z.object({
        tasks: z
          .array(
            z.object({
              task: z
                .string()
                .describe(
                  "What the agent should do — include exact file paths and symbol names from the repo map",
                ),
              role: z
                .enum(["explore", "code"])
                .default("explore")
                .describe("Agent type (default: explore)"),
              id: z.string().optional().describe("Unique ID (auto-generated if omitted)"),
              dependsOn: z
                .array(z.string())
                .optional()
                .describe("IDs of tasks that must complete first"),
            }),
          )
          .min(1)
          .max(5)
          .describe("Agent tasks to dispatch"),
        objective: z
          .string()
          .optional()
          .describe("High-level objective (useful for multi-agent coordination)"),
      }),
      execute: async (args, { abortSignal, toolCallId }) => {
        const bus = new AgentBus(cacheRef.current);

        const tasks: AgentTask[] = args.tasks.map((t, i) => ({
          agentId: t.id ?? `agent-${String(i + 1)}`,
          role: t.role,
          task: t.task,
          dependsOn: t.dependsOn,
        }));

        bus.registerTasks(tasks);

        bus.onCacheEvent = (agentId, type, path, sourceAgentId) => {
          emitSubagentStep({
            parentToolCallId: toolCallId,
            toolName: "read_file",
            args: path,
            state: type === "wait" ? "running" : "done",
            agentId,
            cacheState: type,
            sourceAgentId,
          });
        };

        bus.onToolCacheHit = (agentId, toolName, key) => {
          const colonIdx = key.indexOf(":");
          const args = colonIdx >= 0 ? key.slice(colonIdx + 1) : "";
          emitSubagentStep({
            parentToolCallId: toolCallId,
            toolName,
            args,
            state: "done",
            agentId,
            cacheState: "hit",
          });
        };

        const isSingle = tasks.length === 1;

        if (!isSingle) {
          emitMultiAgentEvent({
            parentToolCallId: toolCallId,
            type: "dispatch-start",
            totalAgents: tasks.length,
          });
        }

        if (isSingle) {
          const task = tasks[0] as AgentTask;
          let lastErr: unknown;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (abortSignal?.aborted) break;
            if (attempt > 0) {
              const jitter = Math.random() * 1000;
              await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) + jitter, abortSignal);
              if (abortSignal?.aborted) break;
            }
            try {
              const useExploreAgent = task.role === "explore" || models.readOnly === true;
              const agent = useExploreAgent
                ? createExploreAgent(models.explorationModel ?? models.defaultModel, {
                    bus,
                    agentId: task.agentId,
                    providerOptions: models.providerOptions,
                    headers: models.headers,
                    webSearchModel: models.webSearchModel,
                    onApproveWebSearch: models.onApproveWebSearch,
                    repoMapContext: models.repoMapContext,
                  })
                : createCodeAgent(models.codingModel ?? models.defaultModel, {
                    bus,
                    agentId: task.agentId,
                    providerOptions: models.providerOptions,
                    headers: models.headers,
                    webSearchModel: models.webSearchModel,
                    onApproveWebSearch: models.onApproveWebSearch,
                    repoMapContext: models.repoMapContext,
                  });

              const result = await agent.generate({
                prompt: task.task,
                abortSignal,
                ...buildStepCallbacks(toolCallId, task.agentId),
              });
              const doneResult = extractDoneResult(result);
              autoPostCompletionSummary(bus, task);
              cacheRef.current = bus.exportCaches();
              return doneResult ? formatDoneResult(doneResult) : buildFallbackResult(result);
            } catch (error) {
              lastErr = error;
              if (!isRetryable(error) || attempt === MAX_RETRIES) throw error;
            }
          }
          throw lastErr;
        }

        const taskIds = new Set(tasks.map((t) => t.agentId));
        for (const task of tasks) {
          if (task.dependsOn) {
            for (const dep of task.dependsOn) {
              if (!taskIds.has(dep)) {
                return `Error: task "${task.agentId}" depends on unknown task "${dep}"`;
              }
            }
          }
        }

        const hasCycle = (() => {
          const visited = new Set<string>();
          const stack = new Set<string>();
          const depMap = new Map(tasks.map((t) => [t.agentId, t.dependsOn ?? []]));
          const dfs = (id: string): boolean => {
            if (stack.has(id)) return true;
            if (visited.has(id)) return false;
            visited.add(id);
            stack.add(id);
            for (const dep of depMap.get(id) ?? []) {
              if (dfs(dep)) return true;
            }
            stack.delete(id);
            return false;
          };
          return tasks.some((t) => dfs(t.agentId));
        })();
        if (hasCycle) return "Error: dependency cycle detected among tasks";

        const STAGGER_MS = 100;
        const promises = tasks.map((task, idx) => {
          const hasDeps = task.dependsOn && task.dependsOn.length > 0;
          const delay = hasDeps ? 0 : idx * STAGGER_MS;
          const run = () => runAgentTask(task, models, bus, toolCallId, tasks.length, abortSignal);
          return delay > 0 ? sleep(delay, abortSignal).then(run) : run();
        });
        await Promise.all(promises);

        emitMultiAgentEvent({
          parentToolCallId: toolCallId,
          type: "dispatch-done",
          totalAgents: tasks.length,
          completedAgents: bus.completedAgentIds.length,
          findingCount: bus.findingCount,
        });

        const results = bus.getAllResults();
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        const sections: string[] = [];
        const heading = args.objective ?? "Dispatch";
        sections.push(`## ${heading}`);
        sections.push(
          `**${String(successful.length)}/${String(tasks.length)}** agents completed successfully.`,
        );

        if (bus.findingCount > 0) {
          const findings = bus.getFindings();
          sections.push(
            `### Coordination Findings (${String(findings.length)})`,
            ...findings.map((f) => `**[${f.agentId}] ${f.label}:**\n${f.content}`),
          );
        }

        for (const r of results) {
          const status = r.success ? "✓" : "✗";
          sections.push(
            `\n### ${status} Agent: ${r.agentId} (${r.role})\n**Task:** ${r.task}\n\n${r.result}`,
          );
        }

        if (failed.length > 0) {
          sections.push(
            `\n### Errors\n${failed.map((r) => `- ${r.agentId}: ${r.error}`).join("\n")}`,
          );
        }

        const allEdited = bus.getEditedFiles();
        if (allEdited.size > 0) {
          const lines: string[] = [];
          const conflicts: string[] = [];
          for (const [path, agents] of allEdited) {
            lines.push(`- \`${path}\` — ${agents.join(", ")}`);
            if (agents.length > 1) conflicts.push(path);
          }
          sections.push(`\n### Files Edited\n${lines.join("\n")}`);
          if (conflicts.length > 0) {
            sections.push(
              `\n⚠ **Edit conflicts detected** — multiple agents edited: ${conflicts.map((p) => `\`${p}\``).join(", ")}. Review these files carefully.`,
            );
          }
        }

        const evalResult = await runEvaluator(bus, tasks, toolCallId);
        if (evalResult) sections.push(evalResult);

        cacheRef.current = bus.exportCaches();
        return sections.join("\n");
      },
      toModelOutput({ output }: { toolCallId: string; input: unknown; output: unknown }) {
        if (typeof output !== "string") return { type: "text" as const, value: String(output) };

        const lines = output.split("\n");
        const compact: string[] = [];
        let blankRun = 0;
        let inCodeBlock = false;

        for (const line of lines) {
          if (line.startsWith("```")) inCodeBlock = !inCodeBlock;
          if (line.trim() === "") {
            blankRun++;
            if (blankRun <= 1) compact.push("");
            continue;
          }
          blankRun = 0;
          const limit = inCodeBlock ? 500 : 250;
          compact.push(line.length > limit ? `${line.slice(0, limit)}...` : line);
        }

        return { type: "text" as const, value: compact.join("\n") };
      },
    }),
  };
}
