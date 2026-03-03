import { Box } from "ink";
import { useMemo } from "react";
import { Markdown } from "./Markdown.js";
import { ReasoningBlock } from "./ReasoningBlock.js";
import { type LiveToolCall, ToolCallDisplay } from "./ToolCallDisplay.js";

type StreamSegment =
  | { type: "text"; content: string }
  | { type: "tools"; callIds: string[] }
  | { type: "reasoning"; content: string; id: string };

export type { StreamSegment };

export function StreamSegmentList({
  segments,
  toolCalls,
}: {
  segments: StreamSegment[];
  toolCalls: LiveToolCall[];
}) {
  const toolCallMap = useMemo(() => new Map(toolCalls.map((tc) => [tc.id, tc])), [toolCalls]);
  return (
    <>
      {segments.map((seg, i) => {
        const prev = i > 0 ? segments[i - 1] : null;
        const needsGap = prev && prev.type !== seg.type ? 1 : 0;
        if (seg.type === "text") {
          return (
            <Box key={`text-${String(i)}`} marginTop={needsGap}>
              <Markdown text={seg.content} color="#ccc" />
            </Box>
          );
        }
        if (seg.type === "reasoning") {
          return (
            <Box key={seg.id} marginTop={needsGap}>
              <ReasoningBlock content={seg.content} expanded isStreaming />
            </Box>
          );
        }
        const calls = seg.callIds
          .map((id: string) => toolCallMap.get(id))
          .filter((tc): tc is LiveToolCall => tc != null);
        if (calls.length === 0) return null;
        return (
          <Box key={seg.callIds[0]} marginTop={needsGap}>
            <ToolCallDisplay calls={calls} />
          </Box>
        );
      })}
    </>
  );
}
