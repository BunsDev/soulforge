import type { TaskRouter } from "../../types/index.js";

export type TaskType = "planning" | "coding" | "exploration" | "default";

/** Detect the task type from the user's message. */
export function detectTaskType(message: string): TaskType {
  if (message.startsWith("[PLAN MODE]")) return "planning";
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
