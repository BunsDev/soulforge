import { relative } from "node:path";
import { TextAttributes } from "@opentui/core";
import { useMemo } from "react";
import type { ChatMessage, Plan, PlanStepStatus } from "../types/index.js";
import { POPUP_BG, Spinner } from "./shared.js";

const W = 30;
const INNER = W - 2;
const BC = "#8B5CF6";
const BG = POPUP_BG;

const STATUS_ICONS: Record<PlanStepStatus, string> = {
  done: "\uF058",
  active: "",
  pending: "\uDB80\uDD31",
  skipped: "\uDB80\uDD56",
};

const STATUS_COLORS: Record<PlanStepStatus, string> = {
  done: "#2d5",
  active: "#FF0040",
  pending: "#555",
  skipped: "#444",
};

function R({ children }: { children: React.ReactNode }) {
  return (
    <box height={1} width={W} overflow="hidden">
      <box position="absolute">
        <text bg={BG}>{" ".repeat(W)}</text>
      </box>
      <box position="absolute" width={W} flexDirection="row" overflow="hidden">
        <text fg={BC} bg={BG}>
          {"│"}
        </text>
        <text bg={BG}> </text>
        {children}
      </box>
      <box position="absolute" width={W} justifyContent="flex-end">
        <text fg={BC} bg={BG}>
          {"│"}
        </text>
      </box>
    </box>
  );
}

function HLine({ l, r }: { l: string; r: string }) {
  return (
    <box height={1} width={W}>
      <box position="absolute">
        <text bg={BG}>{" ".repeat(W)}</text>
      </box>
      <box position="absolute">
        <text fg={BC} bg={BG}>
          {l}
          {"─".repeat(W - 2)}
          {r}
        </text>
      </box>
    </box>
  );
}

interface Props {
  showPlan: boolean;
  plan: Plan | null;
  showChanges: boolean;
  messages: ChatMessage[];
  cwd: string;
}

export function FloatingPanel({ showPlan, plan, showChanges, messages, cwd }: Props) {
  const files = useMemo(() => {
    if (!showChanges) return [];
    const fileMap = new Map<string, { path: string; editCount: number; created: boolean }>();
    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name === "edit_file" && typeof tc.args.path === "string" && tc.result?.success) {
          const path = tc.args.path as string;
          const existing = fileMap.get(path);
          const isCreate = typeof tc.args.oldString === "string" && tc.args.oldString === "";
          if (existing) {
            existing.editCount++;
            if (isCreate) existing.created = true;
          } else {
            fileMap.set(path, { path, editCount: 1, created: isCreate });
          }
        }
      }
    }
    return [...fileMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [showChanges, messages]);

  const maxLabel = 20;

  return (
    <box flexDirection="column" width={W} flexShrink={0}>
      <HLine l="╭" r="╮" />

      {showPlan && plan && (
        <>
          <R>
            <text fg="#9B30FF" attributes={TextAttributes.BOLD} bg={BG}>
              {"\uF0CB"} Plan
            </text>
            <text fg="#555" bg={BG}>
              {"  "}
              {String(plan.steps.filter((s) => s.status === "done").length)}/
              {String(plan.steps.length)}
            </text>
          </R>
          {plan.steps.map((step) => (
            <R key={step.id}>
              {step.status === "active" ? (
                <Spinner />
              ) : (
                <text fg={STATUS_COLORS[step.status]} bg={BG}>
                  {STATUS_ICONS[step.status]}
                </text>
              )}
              <text
                fg={step.status === "active" ? "#eee" : STATUS_COLORS[step.status]}
                attributes={step.status === "active" ? TextAttributes.BOLD : undefined}
                bg={BG}
              >
                {" "}
                {step.label.length > maxLabel
                  ? `${step.label.slice(0, maxLabel - 1)}…`
                  : step.label}
              </text>
            </R>
          ))}
        </>
      )}

      {showPlan && plan && files.length > 0 && <HLine l="├" r="┤" />}

      {files.length > 0 && (
        <>
          <R>
            <text fg="#9B30FF" attributes={TextAttributes.BOLD} bg={BG}>
              {"\uF07C"} Changes
            </text>
            <text fg="#555" bg={BG}>
              {"  "}
              {String(files.length)} file{files.length === 1 ? "" : "s"}
            </text>
          </R>
          {files.map((f) => {
            const name = relative(cwd, f.path) || f.path;
            const display = name.length > INNER - 4 ? `…${name.slice(-(INNER - 5))}` : name;
            return (
              <R key={f.path}>
                <text fg={f.created ? "#2d5" : "#FF8C00"} bg={BG}>
                  {display}
                </text>
                {f.editCount > 1 && (
                  <text fg="#555" bg={BG}>
                    {" "}
                    ({String(f.editCount)})
                  </text>
                )}
              </R>
            );
          })}
        </>
      )}

      <HLine l="╰" r="╯" />
    </box>
  );
}
