import { Box, Text } from "ink";
import { useEffect, useState } from "react";

const THINKING_ICON = "\uDB80\uDE26"; // 󰘦 nf-md-brain
const DIMMED = "#555";

interface Props {
  content: string;
  expanded: boolean;
  isStreaming?: boolean;
}

function AnimatedDots() {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setDots((d) => (d % 3) + 1);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color={DIMMED}>
      {THINKING_ICON} Thinking{".".repeat(dots)}
    </Text>
  );
}

export function ReasoningBlock({ content, expanded, isStreaming }: Props) {
  // While streaming: show animated "Thinking..." indicator
  if (isStreaming && !expanded) {
    return (
      <Box paddingLeft={2} height={1} flexShrink={0}>
        <AnimatedDots />
      </Box>
    );
  }

  // While streaming + expanded: show live content
  if (isStreaming && expanded) {
    const lines = content.split("\n");
    const maxLines = 6;
    const visible = lines.slice(-maxLines);
    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Box height={1} flexShrink={0}>
          <AnimatedDots />
        </Box>
        {visible.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable line order
          <Box key={i} paddingLeft={2}>
            <Text color="#555">{line}</Text>
          </Box>
        ))}
        {lines.length > maxLines && (
          <Box paddingLeft={2}>
            <Text color="#444">...{String(lines.length - maxLines)} more lines</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Finished: auto-collapsed summary (like tool calls)
  const lines = content.split("\n");
  const lineCount = lines.length;
  const firstLine = (lines[0] ?? "").trim();
  const preview = firstLine.length > 70 ? `${firstLine.slice(0, 67)}...` : firstLine;

  return (
    <Box paddingLeft={2} height={1} flexShrink={0}>
      <Text color={DIMMED} wrap="truncate">
        ✓ {THINKING_ICON} {preview || "Reasoned"}{" "}
        {lineCount > 1 ? `(${String(lineCount)} lines)` : ""}
      </Text>
    </Box>
  );
}
