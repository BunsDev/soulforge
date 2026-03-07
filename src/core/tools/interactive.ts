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
        "The user MUST confirm before you proceed. " +
        "CRITICAL: Research BEFORE calling plan — read every file you'll touch so the plan has exact details. " +
        "The plan must be SELF-CONTAINED: exact file paths, symbol names, signatures, and implementation details " +
        "so execution requires ZERO exploration or dispatch. Every file and symbol you'll touch must be listed. " +
        "If you can't fill in exact details, you haven't researched enough — go read the code first.",
      inputSchema: z.object({
        title: z.string().describe("Short plan title (2-6 words)"),
        context: z.string().describe("What problem this solves and why these changes are needed"),
        files: z
          .array(
            z.object({
              path: z.string().describe("Exact file path from Repo Map or research — never guess"),
              action: z.enum(["create", "modify", "delete"]).describe("Type of change"),
              description: z.string().describe("What changes to make in this file"),
              symbols: z
                .array(
                  z.object({
                    name: z.string().describe("Symbol name (function, class, type, variable)"),
                    kind: z
                      .string()
                      .describe("Symbol kind: function, class, interface, type, method, variable"),
                    action: z
                      .enum(["add", "modify", "remove", "rename"])
                      .describe("What to do with this symbol"),
                    details: z
                      .string()
                      .describe(
                        "Exact change: new signature, parameter changes, logic to add/remove. " +
                          "Include current signature for modifications.",
                      ),
                    line: z
                      .number()
                      .optional()
                      .describe("Current line number if modifying/removing"),
                  }),
                )
                .optional()
                .catch(undefined)
                .describe("Symbols to change in this file — include for all modify/delete actions"),
            }),
          )
          .describe("All files to change — REQUIRED"),
        steps: z
          .array(
            z.object({
              id: z.string().describe("Step ID (step-1, step-2, etc.)"),
              label: z.string().describe("Short step label for the checklist"),
              details: z
                .string()
                .optional()
                .default("")
                .describe(
                  "Exact implementation instructions: what to read_code, what to edit_file (old → new), " +
                    "what to shell/project. Must be executable without further research.",
                ),
            }),
          )
          .describe("Ordered implementation steps with full details"),
        verification: z
          .array(z.string())
          .optional()
          .catch(undefined)
          .describe("How to verify the changes work"),
      }),
      execute: async (args) => {
        const lines = [`# ${args.title}`, "", `## Context`, "", args.context, "", `## Files`];
        for (const f of args.files) {
          lines.push(`- **${f.action}** \`${f.path}\` — ${f.description}`);
          if (f.symbols?.length) {
            for (const s of f.symbols) {
              const loc = s.line ? `:${String(s.line)}` : "";
              lines.push(`  - ${s.action} \`${s.name}\` (${s.kind}${loc}): ${s.details}`);
            }
          }
        }
        lines.push("", "## Steps");
        for (const s of args.steps) {
          lines.push(`### ${s.id}. ${s.label}`, "", s.details, "");
        }
        if (args.verification?.length) {
          lines.push("## Verification");
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

        const action = await callbacks.onPlanReview(
          plan,
          `.soulforge/plans/${fname}`,
          lines.join("\n"),
        );

        const planFile = `.soulforge/plans/${fname}`;
        if (action === "execute") {
          return {
            success: true,
            file: planFile,
            output:
              "Plan confirmed by user. Proceed with execution step by step. Call update_plan_step to mark steps as active/done/skipped.",
          };
        }
        if (action === "clear_execute") {
          return {
            success: true,
            file: planFile,
            output: "Plan confirmed. Context will be cleared and plan re-submitted for execution.",
          };
        }
        if (action === "cancel" || action === "__skipped__") {
          return {
            success: true,
            file: planFile,
            output: "Plan cancelled by user. Wait for further instructions.",
          };
        }
        return {
          success: true,
          file: planFile,
          output: `User wants changes to the plan: ${action}`,
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
