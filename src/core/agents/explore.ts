import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { hasToolCall, stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { buildSubagentExploreTools, wrapWithBusCache } from "../tools/index.js";
import type { AgentBus } from "./agent-bus.js";
import { buildBusTools } from "./bus-tools.js";
import { buildPrepareStep, tokenBudget } from "./step-utils.js";

const EXPLORE_BASE = `Explore agent. Read-only codebase research.
You have LSP-powered code intelligence — USE IT instead of grep/glob/read_file.
- Find symbol → navigate definition/workspace_symbols. NEVER grep.
- Read function/class → read_code with symbol name. NEVER read_file and scroll.
- Who calls/uses X → navigate references/call_hierarchy. NEVER grep.
- File structure → analyze outline. Errors → analyze diagnostics.
- Type info → analyze type_info. Imports → navigate imports/exports.
- read_file: ONLY for config (json/yaml) or full raw text after read_code.
- grep/glob: ONLY for string literals or non-code patterns.

WORKFLOW: Your task includes specific file paths and symbols. Go directly to those targets — read_code for the named symbols, read_file only if the task specifies config files. Do NOT grep/glob to rediscover locations already given to you. If the repo map is appended below, use it to navigate related code without extra discovery steps.
DISCOVERY: If your task names symbols or keywords but NOT file paths, run one navigate workspace_symbols call with the keyword, then read_code on the result. If workspace_symbols returns nothing, fall back to grep for the symbol name across the codebase. One search, one read — never chain multiple discovery tools for the same target. If the task is web research, go straight to web_search.

OUTPUT CONTRACT: Your done call must be DATA-RICH. Include actual code excerpts, type signatures, function bodies, and line numbers. The parent agent cannot see your tool results — only what you put in the done call. If the task asks "how does X work", show the code. If it asks "what type is Y", paste the type definition. Never say "I found that..." — just show the evidence.`;

const EXPLORE_INSTRUCTIONS = EXPLORE_BASE;

const EXPLORE_BUS_INSTRUCTIONS = `${EXPLORE_BASE}
Coordination: report_finding to share discoveries. Peer findings appear in tool results — check_findings for detail.`;

const ANTHROPIC_CACHE = {
  anthropic: { cacheControl: { type: "ephemeral" } },
} as const;

const exploreDoneTool = tool({
  description:
    "Call when research is complete. Include actual code in your findings — the parent agent cannot see your tool results, only what you put here.",
  inputSchema: z.object({
    summary: z.string().describe("Direct answer to the task question with key conclusions"),
    filesExamined: z.array(z.string()).describe("File paths you examined"),
    keyFindings: z
      .array(
        z.object({
          file: z.string(),
          detail: z
            .string()
            .describe(
              "Concrete evidence: paste relevant code excerpts, type definitions, function signatures. Not descriptions of what you saw.",
            ),
          lineNumbers: z.string().optional(),
        }),
      )
      .describe("Findings with actual code content from the files"),
  }),
});

interface ExploreAgentOptions {
  bus?: AgentBus;
  agentId?: string;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
  webSearchModel?: LanguageModel;
  onApproveWebSearch?: (query: string) => Promise<boolean>;
  repoMapContext?: string;
}

export function createExploreAgent(model: LanguageModel, options?: ExploreAgentOptions) {
  const bus = options?.bus;
  const agentId = options?.agentId;
  const hasBus = !!(bus && agentId);
  const busTools = hasBus ? buildBusTools(bus, agentId, "explore") : {};

  let tools = buildSubagentExploreTools({
    webSearchModel: options?.webSearchModel,
    onApproveWebSearch: options?.onApproveWebSearch,
  });
  if (hasBus) {
    tools = wrapWithBusCache(tools, bus, agentId) as typeof tools;
  }

  const allTools = {
    ...tools,
    ...busTools,
    done: exploreDoneTool,
  };

  return new ToolLoopAgent({
    id: options?.agentId ?? "explore",
    model,
    tools: allTools,
    instructions: {
      role: "system" as const,
      content:
        (hasBus ? EXPLORE_BUS_INSTRUCTIONS : EXPLORE_INSTRUCTIONS) +
        (options?.repoMapContext
          ? `\n\nRepo map (ranked by importance, + = exported):\n${options.repoMapContext}`
          : ""),
      providerOptions: ANTHROPIC_CACHE,
    },
    stopWhen: [stepCountIs(15), tokenBudget(80_000), hasToolCall("done")],
    prepareStep: buildPrepareStep({ bus, agentId, role: "explore", allTools }),
    ...(options?.providerOptions && Object.keys(options.providerOptions).length > 0
      ? { providerOptions: options.providerOptions }
      : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}
