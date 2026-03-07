import type { TaskRouter } from "../../types/index.js";

export type TaskType = "planning" | "coding" | "exploration" | "webSearch" | "compact" | "default";

/** Detect the task type from the user's message. */
export function detectTaskType(message: string): TaskType {
  if (message.startsWith("[PLAN MODE]")) return "planning";

  const lower = message.toLowerCase();

  // Web search patterns — explicit web/internet/search intent
  const webSearchPatterns =
    /\b(search the web|search online|google|look up online|browse|web search|search for .* online|what's new with|latest news|current price|live score)\b/;
  if (webSearchPatterns.test(lower)) return "webSearch";

  // Coding patterns — check FIRST because "fix why X is broken" is coding, not exploration
  const codePatterns =
    /^(add|create|implement|fix|update|change|modify|refactor|rename|delete|remove|write|build|move|extract|migrate|replace|convert|make)\b/;
  if (codePatterns.test(lower)) return "coding";

  // Action verbs anywhere in the message (not just at start)
  const actionAnywhere =
    /\b(fix|implement|add|create|update|refactor|rename|delete|remove|write|build|move|extract|replace)\s+(the|this|a|an|that|it)\b/;
  if (actionAnywhere.test(lower)) return "coding";

  // Exploration patterns — questions, lookups, research
  const explorePatterns =
    /^(what|where|how|why|which|find|search|look|show|list|explain|describe|understand)\b/;
  if (explorePatterns.test(lower)) return "exploration";

  return "default";
}

/**
 * Resolve which model ID to use for a given task type.
 * Falls back: taskRouter[taskType] → taskRouter.default → activeModel.
 */
export function resolveTaskModel(
  taskType: TaskType,
  taskRouter: TaskRouter | undefined,
  activeModel: string,
): string {
  if (!taskRouter) return activeModel;
  const specific = taskRouter[taskType];
  if (specific) return specific;
  return taskRouter.default ?? activeModel;
}
