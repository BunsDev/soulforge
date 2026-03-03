import { Box, Text } from "ink";
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

interface Props {
  plan: PlanOutput;
}

export function StructuredPlanView({ plan }: Props) {
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box minHeight={1} flexShrink={0}>
        <Text>
          <Text color={BORDER}>{"┌── "}</Text>
          <Text color={TITLE_COLOR} bold>
            {"\uF0CB"} {plan.title}
          </Text>
          <Text color={BORDER}> {"─".repeat(Math.max(1, 40 - plan.title.length))}</Text>
        </Text>
      </Box>

      {/* Context */}
      <Box minHeight={1} flexShrink={0}>
        <Text color={BORDER}>{"│"}</Text>
      </Box>
      <Box minHeight={1} flexShrink={0}>
        <Text>
          <Text color={BORDER}>{"│ "}</Text>
          <Text color={SECTION_COLOR} bold>
            Context
          </Text>
        </Text>
      </Box>
      {plan.context.split("\n").map((line, i) => (
        <Box key={`ctx-${String(i)}`} minHeight={1} flexShrink={0}>
          <Text>
            <Text color={BORDER}>{"│  "}</Text>
            <Text color={TEXT_COLOR}>{line}</Text>
          </Text>
        </Box>
      ))}

      {/* Files */}
      <Box minHeight={1} flexShrink={0}>
        <Text color={BORDER}>{"│"}</Text>
      </Box>
      <Box minHeight={1} flexShrink={0}>
        <Text>
          <Text color={BORDER}>{"│ "}</Text>
          <Text color={SECTION_COLOR} bold>
            Files
          </Text>
          <Text color="#555"> ({String(plan.files.length)})</Text>
        </Text>
      </Box>
      {plan.files.map((f) => (
        <Box key={f.path} flexDirection="column">
          <Box minHeight={1} flexShrink={0}>
            <Text>
              <Text color={BORDER}>{"│  "}</Text>
              <Text color={ACTION_COLORS[f.action] ?? "#888"}>
                {ACTION_ICONS[f.action] ?? "?"}{" "}
              </Text>
              <Text color={FILE_PATH_COLOR}>{f.path}</Text>
            </Text>
          </Box>
          <Box minHeight={1} flexShrink={0}>
            <Text>
              <Text color={BORDER}>{"│    "}</Text>
              <Text color="#777">{f.description}</Text>
            </Text>
          </Box>
        </Box>
      ))}

      {/* Steps */}
      <Box minHeight={1} flexShrink={0}>
        <Text color={BORDER}>{"│"}</Text>
      </Box>
      <Box minHeight={1} flexShrink={0}>
        <Text>
          <Text color={BORDER}>{"│ "}</Text>
          <Text color={SECTION_COLOR} bold>
            Steps
          </Text>
          <Text color="#555"> ({String(plan.steps.length)})</Text>
        </Text>
      </Box>
      {plan.steps.map((s, i) => (
        <Box key={s.id} minHeight={1} flexShrink={0}>
          <Text>
            <Text color={BORDER}>{"│  "}</Text>
            <Text color={STEP_NUM_COLOR}>{String(i + 1)}. </Text>
            <Text color={TEXT_COLOR}>{s.label}</Text>
          </Text>
        </Box>
      ))}

      {/* Verification */}
      <Box minHeight={1} flexShrink={0}>
        <Text color={BORDER}>{"│"}</Text>
      </Box>
      <Box minHeight={1} flexShrink={0}>
        <Text>
          <Text color={BORDER}>{"│ "}</Text>
          <Text color={SECTION_COLOR} bold>
            Verification
          </Text>
        </Text>
      </Box>
      {plan.verification.map((v, i) => (
        <Box key={`v-${String(i)}`} minHeight={1} flexShrink={0}>
          <Text>
            <Text color={BORDER}>{"│  "}</Text>
            <Text color={CHECK_COLOR}>{"✓ "}</Text>
            <Text color={TEXT_COLOR}>{v}</Text>
          </Text>
        </Box>
      ))}

      {/* Footer */}
      <Box minHeight={1} flexShrink={0}>
        <Text color={BORDER}>{"└"}</Text>
        <Text color={BORDER}>{"─".repeat(50)}</Text>
      </Box>
    </Box>
  );
}
