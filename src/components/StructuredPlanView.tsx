import { TextAttributes } from "@opentui/core";
import type { PlanOutput } from "../types/index.js";

const BORDER = "#333";
const TITLE_COLOR = "#00BFFF";
const SECTION_COLOR = "#8B5CF6";
const FILE_PATH_COLOR = "#ccc";
const STEP_NUM_COLOR = "#8B5CF6";
const TEXT_COLOR = "#bbb";
const CHECK_COLOR = "#2d5";

const ACTION_COLORS: Record<string, string> = {
  create: "#2d5",
  modify: "#FF8C00",
  delete: "#f44",
};
const ACTION_ICONS: Record<string, string> = {
  create: "+",
  modify: "~",
  delete: "-",
};

const MAX_VISIBLE = 5;

interface Props {
  plan: PlanOutput;
  result?: string;
}

export function StructuredPlanView({ plan, result }: Props) {
  const files = plan.files ?? [];
  const steps = plan.steps ?? [];
  const verification = plan.verification ?? [];
  const context = plan.context ?? "";

  // Determine plan outcome from tool result
  const isCancelled = result?.includes("cancelled by user");
  const isRevised = result?.startsWith("User wants changes to the plan:");
  const reviseFeedback =
    isRevised && result ? result.replace("User wants changes to the plan: ", "") : null;
  const isRejected = isCancelled || isRevised;

  // Dim the border color for rejected plans
  const borderColor = isRejected ? "#222" : BORDER;
  const titleColor = isRejected ? "#555" : TITLE_COLOR;

  if (isRejected) {
    return (
      <box flexDirection="column">
        <box minHeight={1} flexShrink={0}>
          <text>
            <span fg={borderColor}>{"┌── "}</span>
            <span fg={titleColor} attributes={TextAttributes.BOLD}>
              {"\uF0CB"} {plan.title}
            </span>
            <span fg={borderColor}> {"─".repeat(Math.max(1, 40 - plan.title.length))}</span>
          </text>
        </box>
        <box minHeight={1} flexShrink={0}>
          <text>
            <span fg={borderColor}>{"│ "}</span>
            {isCancelled ? (
              <span fg="#f44">✗ Plan cancelled</span>
            ) : (
              <>
                <span fg="#FF8C00">↻ Revision requested: </span>
                <span fg="#bbb">{reviseFeedback}</span>
              </>
            )}
          </text>
        </box>
        <box minHeight={1} flexShrink={0} flexDirection="row">
          <text fg={borderColor}>{"└"}</text>
          <text fg={borderColor}>{"─".repeat(50)}</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column">
      <box minHeight={1} flexShrink={0}>
        <text>
          <span fg={BORDER}>{"┌── "}</span>
          <span fg={TITLE_COLOR} attributes={TextAttributes.BOLD}>
            {"\uF0CB"} {plan.title}
          </span>
          <span fg={BORDER}> {"─".repeat(Math.max(1, 40 - plan.title.length))}</span>
        </text>
      </box>

      {context && (
        <>
          <box minHeight={1} flexShrink={0}>
            <text fg={BORDER}>{"│"}</text>
          </box>
          <box minHeight={1} flexShrink={0}>
            <text>
              <span fg={BORDER}>{"│ "}</span>
              <span fg={SECTION_COLOR} attributes={TextAttributes.BOLD}>
                Context
              </span>
            </text>
          </box>
          {context.split("\n").map((line, i) => (
            <box key={`ctx-${String(i)}`} minHeight={1} flexShrink={0}>
              <text>
                <span fg={BORDER}>{"│  "}</span>
                <span fg={TEXT_COLOR}>{line}</span>
              </text>
            </box>
          ))}
        </>
      )}

      {files.length > 0 && (
        <>
          <box minHeight={1} flexShrink={0}>
            <text fg={BORDER}>{"│"}</text>
          </box>
          <box minHeight={1} flexShrink={0}>
            <text>
              <span fg={BORDER}>{"│ "}</span>
              <span fg={SECTION_COLOR} attributes={TextAttributes.BOLD}>
                Files
              </span>
              <span fg="#555"> ({String(files.length)})</span>
            </text>
          </box>
          {files.slice(0, MAX_VISIBLE).map((f) => (
            <box key={f.path} flexDirection="column">
              <box minHeight={1} flexShrink={0}>
                <text>
                  <span fg={BORDER}>{"│  "}</span>
                  <span fg={ACTION_COLORS[f.action] ?? "#888"}>
                    {ACTION_ICONS[f.action] ?? "?"}{" "}
                  </span>
                  <span fg={FILE_PATH_COLOR}>{f.path}</span>
                </text>
              </box>
              <box minHeight={1} flexShrink={0}>
                <text>
                  <span fg={BORDER}>{"│    "}</span>
                  <span fg="#777">{f.description}</span>
                </text>
              </box>
            </box>
          ))}
          {files.length > MAX_VISIBLE && (
            <box minHeight={1} flexShrink={0}>
              <text>
                <span fg={BORDER}>{"│  "}</span>
                <span fg="#555">+{String(files.length - MAX_VISIBLE)} more</span>
              </text>
            </box>
          )}
        </>
      )}

      {steps.length > 0 && (
        <>
          <box minHeight={1} flexShrink={0}>
            <text fg={BORDER}>{"│"}</text>
          </box>
          <box minHeight={1} flexShrink={0}>
            <text>
              <span fg={BORDER}>{"│ "}</span>
              <span fg={SECTION_COLOR} attributes={TextAttributes.BOLD}>
                Steps
              </span>
              <span fg="#555"> ({String(steps.length)})</span>
            </text>
          </box>
          {steps.slice(0, MAX_VISIBLE).map((s, i) => (
            <box key={s.id} minHeight={1} flexShrink={0}>
              <text>
                <span fg={BORDER}>{"│  "}</span>
                <span fg={STEP_NUM_COLOR}>{String(i + 1)}. </span>
                <span fg={TEXT_COLOR}>{s.label}</span>
              </text>
            </box>
          ))}
          {steps.length > MAX_VISIBLE && (
            <box minHeight={1} flexShrink={0}>
              <text>
                <span fg={BORDER}>{"│  "}</span>
                <span fg="#555">+{String(steps.length - MAX_VISIBLE)} more</span>
              </text>
            </box>
          )}
        </>
      )}

      {verification.length > 0 && (
        <>
          <box minHeight={1} flexShrink={0}>
            <text fg={BORDER}>{"│"}</text>
          </box>
          <box minHeight={1} flexShrink={0}>
            <text>
              <span fg={BORDER}>{"│ "}</span>
              <span fg={SECTION_COLOR} attributes={TextAttributes.BOLD}>
                Verification
              </span>
            </text>
          </box>
          {verification.map((v, i) => (
            <box key={`v-${String(i)}`} minHeight={1} flexShrink={0}>
              <text>
                <span fg={BORDER}>{"│  "}</span>
                <span fg={CHECK_COLOR}>{"✓ "}</span>
                <span fg={TEXT_COLOR}>{v}</span>
              </text>
            </box>
          ))}
        </>
      )}

      <box minHeight={1} flexShrink={0} flexDirection="row">
        <text fg={BORDER}>{"└"}</text>
        <text fg={BORDER}>{"─".repeat(50)}</text>
      </box>
    </box>
  );
}
