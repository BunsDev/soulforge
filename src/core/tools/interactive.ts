import { tool } from "ai";
import { z } from "zod";
import type { InteractiveCallbacks, Plan, PlanStepStatus } from "../../types/index.js";

/**
 * Build interactive tools that bridge LLM tool calls to React UI via callbacks.
 * Only included when interactive callbacks are provided.
 */
export function buildInteractiveTools(callbacks: InteractiveCallbacks) {
  return {
    plan: tool({
      description:
        "Create an implementation plan before executing multi-step tasks. " +
        "Use this to outline your approach — each step will be displayed as a live checklist. " +
        "Call update_plan_step to mark steps as active/done/skipped as you progress.",
      inputSchema: z.object({
        title: z.string().describe("Short plan title"),
        steps: z
          .array(
            z.object({
              id: z.string().describe("Unique step ID (e.g. 'step-1')"),
              label: z.string().describe("Short step description"),
            }),
          )
          .describe("Ordered list of steps"),
      }),
      execute: async (args) => {
        const plan: Plan = {
          title: args.title,
          steps: args.steps.map((s) => ({
            id: s.id,
            label: s.label,
            status: "pending" as const,
          })),
          createdAt: Date.now(),
        };
        callbacks.onPlanCreate(plan);
        return {
          success: true,
          output: `Plan created: ${args.title} (${String(args.steps.length)} steps)`,
        };
      },
    }),

    update_plan_step: tool({
      description:
        "Update the status of a plan step. Call this as you start and complete each step.",
      inputSchema: z.object({
        stepId: z.string().describe("The step ID to update"),
        status: z
          .enum(["pending", "active", "done", "skipped"])
          .describe("New status for the step"),
      }),
      execute: async (args) => {
        callbacks.onPlanStepUpdate(args.stepId, args.status as PlanStepStatus);
        return { success: true, output: `Step ${args.stepId}: ${args.status}` };
      },
    }),

    editor_panel: tool({
      description:
        "Open the editor panel for the user. " +
        "Optionally specify a file path to open in the editor. " +
        "Use this when you want to show the user a file in the embedded neovim editor.",
      inputSchema: z.object({
        file: z.string().optional().describe("File path to open in the editor"),
      }),
      execute: async (args) => {
        await callbacks.onOpenEditor(args.file);
        return {
          success: true,
          output: args.file ? `Opened ${args.file} in editor` : "Editor panel opened",
        };
      },
    }),

    ask_user: tool({
      description:
        "Ask the user a question with selectable options. " +
        "Use when you need clarification or the user must choose between approaches. " +
        "Blocks until the user answers. Don't overuse — only when genuinely needed.",
      inputSchema: z.object({
        question: z.string().describe("The question to ask"),
        options: z
          .array(
            z.object({
              label: z.string().describe("Display label"),
              value: z.string().describe("Value returned when selected"),
              description: z.string().optional().describe("Optional description"),
            }),
          )
          .describe("Selectable options"),
        allowSkip: z.boolean().optional().describe("Whether the user can skip (Esc)"),
      }),
      execute: async (args) => {
        const answer = await callbacks.onAskUser(
          args.question,
          args.options,
          args.allowSkip ?? true,
        );
        return {
          success: true,
          output:
            answer === "__skipped__" ? "User skipped this question." : `User selected: ${answer}`,
        };
      },
    }),
  };
}
