import type { LanguageModel } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { emitSubagentStep } from "../agents/subagent-events.js";
import { createWebSearchAgent } from "../agents/web-search.js";
import { getShortModelLabel } from "../llm/models.js";
import { webSearchScraper } from "./web-search-scraper.js";

export { webSearchScraper as webSearchTool };

function formatSearchArgs(tc: { toolName: string; input?: unknown }): string {
  const a = (tc.input ?? {}) as Record<string, unknown>;
  if (tc.toolName === "web_search" && a.query) {
    const q = String(a.query);
    return q.length > 50 ? `${q.slice(0, 47)}...` : q;
  }
  if (tc.toolName === "fetch_page" && a.url) {
    const u = String(a.url);
    return u.length > 50 ? `${u.slice(0, 47)}...` : u;
  }
  return "";
}

/**
 * Build a web_search AI SDK tool.
 * When `webSearchModel` is provided, the tool spawns a dedicated search agent
 * that can run multiple queries and follow links. Otherwise falls back to direct scraping.
 */
export function buildWebSearchTool(opts?: {
  webSearchModel?: LanguageModel;
  onApprove?: (query: string) => Promise<boolean>;
}) {
  const { webSearchModel, onApprove } = opts ?? {};

  return tool({
    description: webSearchModel
      ? "Search the web for current information. Dispatches a dedicated search agent that can run multiple queries and follow links for thorough research."
      : webSearchScraper.description,
    inputSchema: z.object({
      query: z.string().describe("Search query or research question"),
      count: z
        .number()
        .optional()
        .describe("Number of results (default 5, ignored when agent is used)"),
    }),
    execute: async (args, { toolCallId, abortSignal }) => {
      if (onApprove) {
        const approved = await onApprove(args.query);
        if (!approved) {
          return {
            success: false,
            output: "Web search was denied by the user.",
            error: "Web search denied.",
          };
        }
      }

      if (webSearchModel) {
        const runningSteps = new Set<string>();
        const mid = typeof webSearchModel === "string" ? webSearchModel : webSearchModel.modelId;
        const backendLabel = getShortModelLabel(mid);

        const markRunningStepsError = () => {
          for (const key of runningSteps) {
            const [name, ...rest] = key.split(":::");
            emitSubagentStep({
              parentToolCallId: toolCallId,
              toolName: name ?? "web_search",
              args: rest.join(":::"),
              state: "error",
            });
          }
          runningSteps.clear();
        };

        try {
          const agent = createWebSearchAgent(webSearchModel);
          const combinedSignal = abortSignal
            ? AbortSignal.any([abortSignal, AbortSignal.timeout(120_000)])
            : AbortSignal.timeout(120_000);
          const result = await agent.generate({
            prompt: args.query,
            abortSignal: combinedSignal,
            experimental_onToolCallStart: (event) => {
              const tc = event.toolCall;
              if (!tc) return;
              const stepArgs = formatSearchArgs(tc);
              runningSteps.add(`${tc.toolName}:::${stepArgs}`);
              emitSubagentStep({
                parentToolCallId: toolCallId,
                toolName: tc.toolName,
                args: stepArgs,
                state: "running",
              });
            },
            experimental_onToolCallFinish: (event) => {
              const tc = event.toolCall;
              if (!tc) return;
              const stepArgs = formatSearchArgs(tc);
              runningSteps.delete(`${tc.toolName}:::${stepArgs}`);
              const ev = event as Record<string, unknown>;
              const ok = ev.success !== false;
              const raw = ev.output ?? ev.result;
              const toolResult =
                raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
              const stepBackend =
                typeof toolResult?.backend === "string" ? toolResult.backend : undefined;
              emitSubagentStep({
                parentToolCallId: toolCallId,
                toolName: tc.toolName,
                args: stepArgs,
                state: ok ? "done" : "error",
                backend: stepBackend,
              });
            },
          });
          return { success: true, output: result.text, backend: backendLabel };
        } catch (err: unknown) {
          markRunningStepsError();
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            output: `Search agent error: ${msg}`,
            error: msg,
            backend: backendLabel,
          };
        }
      }

      return webSearchScraper.execute(args);
    },
  });
}
