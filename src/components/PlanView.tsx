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

  return (
    <box flexDirection="column" flexShrink={0} border borderStyle="rounded" borderColor="#333">
      <box
        height={1}
        flexShrink={0}
        paddingX={1}
        backgroundColor="#1a1a1a"
        alignSelf="flex-start"
        marginTop={-1}
      >
        <text truncate>
          <span fg="#9B30FF">{"\uF0CB"}</span>{" "}
          <span fg="#9B30FF" attributes={TextAttributes.BOLD}>
            {plan.title}
          </span>
          <span fg="#555">
            {"  "}
            {counterText}
          </span>
        </text>
      </box>
      {plan.steps.slice(0, MAX_VISIBLE).map((step) => (
        <box key={step.id} height={1} paddingX={1}>
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
            {step.label}
          </text>
        </box>
      ))}
      {plan.steps.length > MAX_VISIBLE && (
        <box height={1} paddingX={1}>
          <text fg="#555">+{String(plan.steps.length - MAX_VISIBLE)} more</text>
        </box>
      )}
    </box>
  );
}
