import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import type { EditorIntegration, ForgeMode, InteractiveCallbacks } from "../../types/index.js";
import type { ContextManager } from "../context/manager.js";
import { buildInteractiveTools, buildRestrictedModeTools, buildTools } from "../tools/index.js";
import { repairToolCall, sanitizeToolInputsStep, smoothStreamOptions } from "./stream-options.js";
import { buildSubagentTools, type SharedCacheRef } from "./subagent-tools.js";

const RESTRICTED_MODES = new Set<ForgeMode>(["architect", "socratic", "challenge"]);

interface ForgeAgentOptions {
  model: LanguageModel;
  contextManager: ContextManager;
  forgeMode?: ForgeMode;
  interactive?: InteractiveCallbacks;
  editorIntegration?: EditorIntegration;
  subagentModels?: { exploration?: LanguageModel; coding?: LanguageModel };
  webSearchModel?: LanguageModel;
  onApproveWebSearch?: (query: string) => Promise<boolean>;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
  codeExecution?: boolean;
  cwd?: string;
  sessionId?: string;
  sharedCacheRef?: SharedCacheRef;
}

/**
 * Creates the main Forge ToolLoopAgent.
 * Factory function (not singleton) — model can change between turns (Ctrl+L).
 * Combines direct tools + subagent tools + optional interactive tools.
 *
 * For restricted modes (architect, socratic, challenge), only read-only tools
 * are registered — the LLM physically cannot call edit/shell/git.
 */
export function createForgeAgent({
  model,
  contextManager,
  forgeMode = "default",
  interactive,
  editorIntegration,
  subagentModels,
  webSearchModel,
  onApproveWebSearch,
  providerOptions,
  headers,
  codeExecution,
  cwd,
  sessionId,
  sharedCacheRef,
}: ForgeAgentOptions) {
  const isRestricted = RESTRICTED_MODES.has(forgeMode);
  const repoMap = contextManager.isRepoMapReady() ? contextManager.getRepoMap() : undefined;

  const directTools = isRestricted
    ? buildRestrictedModeTools(editorIntegration, onApproveWebSearch, { webSearchModel, repoMap })
    : buildTools(undefined, editorIntegration, onApproveWebSearch, {
        codeExecution,
        webSearchModel,
        repoMap,
      });

  const repoMapContext = contextManager.isRepoMapReady()
    ? contextManager.renderRepoMap() || undefined
    : undefined;

  const subagentTools = isRestricted
    ? {
        dispatch: buildSubagentTools({
          defaultModel: model,
          explorationModel: subagentModels?.exploration,
          webSearchModel,
          providerOptions,
          headers,
          onApproveWebSearch,
          readOnly: true,
          repoMapContext,
          repoMap,
          sharedCacheRef,
        }).dispatch,
      }
    : buildSubagentTools({
        defaultModel: model,
        explorationModel: subagentModels?.exploration,
        codingModel: subagentModels?.coding,
        webSearchModel,
        providerOptions,
        headers,
        onApproveWebSearch,
        repoMapContext,
        repoMap,
        sharedCacheRef,
      });

  return new ToolLoopAgent({
    id: "forge",
    model,
    ...smoothStreamOptions,
    tools: {
      ...directTools,
      ...subagentTools,
      ...(interactive ? buildInteractiveTools(interactive, { cwd, sessionId }) : {}),
    },
    instructions: {
      role: "system" as const,
      content: contextManager.buildSystemPrompt(),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    stopWhen: stepCountIs(500),
    prepareStep: sanitizeToolInputsStep,
    experimental_repairToolCall: repairToolCall,
    ...(providerOptions && Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
  });
}
