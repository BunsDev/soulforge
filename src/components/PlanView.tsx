import { TextAttributes } from "@opentui/core";
import type { Plan, PlanStepStatus } from "../types/index.js";
import { PopupRow, Spinner } from "./shared.js";

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

const MAX_VISIBLE = 5;

interface Props {
  plan: Plan;
  mode: "overlay" | "inline";
  bg?: string;
}

export function PlanView({ plan, mode, bg }: Props) {
  const doneCount = plan.steps.filter((s) => s.status === "done").length;
  const totalCount = plan.steps.length;
  const allDone = doneCount === totalCount;

  if (mode === "overlay") {
    return <OverlayPlan plan={plan} doneCount={doneCount} totalCount={totalCount} bg={bg} />;
  }

  return <InlinePlan plan={plan} doneCount={doneCount} totalCount={totalCount} allDone={allDone} />;
}

function OverlayPlan({
  plan,
  doneCount,
  totalCount,
  bg,
}: {
  plan: Plan;
  doneCount: number;
  totalCount: number;
  bg?: string;
}) {
  const maxLabel = 22;
  const w = 28;

  if (bg) {
    return (
      <box flexDirection="column">
        <PopupRow w={w} bg={bg}>
          <text fg="#9B30FF" attributes={TextAttributes.BOLD} bg={bg}>
            {"\uF0CB"} Plan
          </text>
          <text fg="#555" bg={bg}>
            {"  "}
            {String(doneCount)}/{String(totalCount)}
          </text>
        </PopupRow>
        {plan.steps.slice(0, MAX_VISIBLE).map((step) => (
          <PopupRow key={step.id} w={w} bg={bg}>
            {step.status === "active" ? (
              <Spinner />
            ) : (
              <text fg={STATUS_COLORS[step.status]} bg={bg}>
                {STATUS_ICONS[step.status]}
              </text>
            )}
            <text
              fg={step.status === "active" ? "#eee" : STATUS_COLORS[step.status]}
              attributes={step.status === "active" ? TextAttributes.BOLD : undefined}
              bg={bg}
            >
              {" "}
              {step.label.length > maxLabel ? `${step.label.slice(0, maxLabel - 1)}…` : step.label}
            </text>
          </PopupRow>
        ))}
        {plan.steps.length > MAX_VISIBLE && (
          <PopupRow w={w} bg={bg}>
            <text fg="#555" bg={bg}>
              +{String(plan.steps.length - MAX_VISIBLE)} more
            </text>
          </PopupRow>
        )}
      </box>
    );
  }

  return (
    <box flexDirection="column">
      <box height={1} paddingLeft={2}>
        <text fg="#9B30FF" attributes={TextAttributes.BOLD}>
          {"\uF0CB"} Plan
        </text>
        <text fg="#555">
          {"  "}
          {String(doneCount)}/{String(totalCount)}
        </text>
      </box>
      {plan.steps.slice(0, MAX_VISIBLE).map((step) => (
        <box key={step.id} height={1} paddingLeft={2}>
          {step.status === "active" ? (
            <Spinner />
          ) : (
            <text fg={STATUS_COLORS[step.status]}>{STATUS_ICONS[step.status]}</text>
          )}
          <text
            fg={step.status === "active" ? "#eee" : STATUS_COLORS[step.status]}
            attributes={step.status === "active" ? TextAttributes.BOLD : undefined}
          >
            {" "}
            {step.label.length > maxLabel ? `${step.label.slice(0, maxLabel - 1)}…` : step.label}
          </text>
        </box>
      ))}
      {plan.steps.length > MAX_VISIBLE && (
        <box height={1} paddingLeft={2}>
          <text fg="#555">+{String(plan.steps.length - MAX_VISIBLE)} more</text>
        </box>
      )}
    </box>
  );
}

function InlinePlan({
  plan,
  doneCount,
  totalCount,
  allDone,
}: {
  plan: Plan;
  doneCount: number;
  totalCount: number;
  allDone: boolean;
}) {
  const counterText = allDone ? "done" : `${String(doneCount)}/${String(totalCount)}`;
  const titleLen = plan.title.length + 4;
  const maxLabel = Math.max(titleLen, ...plan.steps.map((s) => s.label.length + 4));
  const counterLen = counterText.length + 4;
  const innerW = Math.max(30, Math.min(56, maxLabel + counterLen));

  const headerContent = `  \uF0CB ${plan.title} `;
  const headerRight = ` ${counterText} `;
  const headerFill = Math.max(0, innerW - headerContent.length - headerRight.length);

  return (
    <box flexDirection="column">
      <text>
        <span fg="#6A0DAD">╭──</span>
        <span fg="#9B30FF" attributes={TextAttributes.BOLD}>
          {headerContent}
        </span>
        <span fg="#6A0DAD">{"─".repeat(headerFill)}</span>
        <span fg="#555">{headerRight}</span>
        <span fg="#6A0DAD">╮</span>
      </text>
      {plan.steps.slice(0, MAX_VISIBLE).map((step) => {
        const label = `${STATUS_ICONS[step.status]} ${step.label}`;
        const pad = Math.max(0, innerW - label.length - 1);
        return (
          <box key={step.id} height={1}>
            <text truncate>
              <span fg="#6A0DAD">│ </span>
              <span fg={STATUS_COLORS[step.status]}>{label}</span>
              <span>{" ".repeat(pad)}</span>
              <span fg="#6A0DAD">│</span>
            </text>
          </box>
        );
      })}
      {plan.steps.length > MAX_VISIBLE && (
        <box height={1}>
          <text truncate>
            <span fg="#6A0DAD">│ </span>
            <span fg="#555">+{String(plan.steps.length - MAX_VISIBLE)} more</span>
            <span>{" ".repeat(Math.max(0, innerW - 8))}</span>
            <span fg="#6A0DAD">│</span>
          </text>
        </box>
      )}
      <text>
        <span fg="#6A0DAD">╰{"─".repeat(innerW)}╯</span>
      </text>
    </box>
  );
}
