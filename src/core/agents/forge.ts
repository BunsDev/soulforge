import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import type { EditorIntegration, InteractiveCallbacks } from "../../types/index.js";
import type { ContextManager } from "../context/manager.js";
import { buildInteractiveTools, buildTools } from "../tools/index.js";
import { buildSubagentTools } from "./subagent-tools.js";

interface ForgeAgentOptions {
  model: LanguageModel;
  contextManager: ContextManager;
  interactive?: InteractiveCallbacks;
  editorIntegration?: EditorIntegration;
  subagentModels?: { exploration?: LanguageModel; coding?: LanguageModel };
}

/**
 * Creates the main Forge ToolLoopAgent.
 * Factory function (not singleton) — model can change between turns (Ctrl+L).
 * Combines direct tools + subagent tools + optional interactive tools.
 */
export function createForgeAgent({
  model,
  contextManager,
  interactive,
  editorIntegration,
  subagentModels,
}: ForgeAgentOptions) {
  return new ToolLoopAgent({
    id: "forge",
    model,
    tools: {
      ...buildTools(undefined, editorIntegration),
      ...buildSubagentTools({
        defaultModel: model,
        explorationModel: subagentModels?.exploration,
        codingModel: subagentModels?.coding,
      }),
      ...(interactive ? buildInteractiveTools(interactive) : {}),
    },
    instructions: contextManager.buildSystemPrompt(),
    stopWhen: stepCountIs(500),
  });
}
