import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import type { InteractiveCallbacks, Plan, PlanStepStatus } from "../../types/index.js";

function planFileName(sessionId?: string): string {
  return sessionId ? `plan-${sessionId}.md` : "plan.md";
}

export function buildInteractiveTools(
  callbacks: InteractiveCallbacks,
  opts?: { cwd?: string; sessionId?: string },
) {
  const cwd = opts?.cwd ?? process.cwd();
  const fname = planFileName(opts?.sessionId);

  return {
    plan: tool({
      description:
        "Create an implementation plan before executing multi-step tasks. " +
        "Use this to outline your approach — each step will be displayed as a live checklist the user can see. " +
        "The user MUST confirm before you proceed. " +
        "Call update_plan_step to mark steps as active/done/skipped as you progress.",
      inputSchema: z.object({
        title: z.string().describe("Short plan title (2-6 words)"),
        context: z.string().describe("What problem this solves and why these changes are needed"),
        files: z
          .array(
            z.object({
              path: z.string().describe("File path relative to project root"),
              action: z.enum(["create", "modify", "delete"]).describe("Type of change"),
              description: z.string().describe("What changes to make in this file"),
            }),
          )
          .optional()
          .describe("Files to change"),
        steps: z
          .array(
            z.object({
              id: z.string().describe("Step ID (step-1, step-2, etc.)"),
              label: z.string().describe("Short step description"),
            }),
          )
          .describe("Ordered implementation steps"),
        verification: z.array(z.string()).optional().describe("How to verify the changes work"),
      }),
      execute: async (args) => {
        const lines = [`# ${args.title}`, "", `## Context`, "", args.context, "", `## Files`];
        if (args.files) {
          for (const f of args.files) {
            lines.push(`- **${f.action}** \`${f.path}\` — ${f.description}`);
          }
        }
        lines.push("", "## Steps");
        for (const s of args.steps) {
          lines.push(`${s.id}. ${s.label}`);
        }
        if (args.verification?.length) {
          lines.push("", "## Verification");
          for (const v of args.verification) {
            lines.push(`- ${v}`);
          }
        }

        const dir = join(cwd, ".soulforge", "plans");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, fname), lines.join("\n"));

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

        const action = await callbacks.onPlanReview(plan, `.soulforge/plans/${fname}`);

        if (action === "execute") {
          return {
            success: true,
            output:
              "Plan confirmed by user. Proceed with execution step by step. Call update_plan_step to mark steps as active/done/skipped.",
          };
        }
        if (action === "clear_execute") {
          return {
            success: true,
            output: "Plan confirmed. Context will be cleared and plan re-submitted for execution.",
          };
        }
        if (action === "cancel" || action === "__skipped__") {
          return {
            success: true,
            output: "Plan cancelled by user. Wait for further instructions.",
          };
        }
        return { success: true, output: `User wants changes to the plan: ${action}` };
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
