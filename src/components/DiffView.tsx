// ─── Forge Diff — Bracketed Rail Diff Viewer ───

import { readFileSync } from "node:fs";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { computeDiff, type DiffLine, langFromPath } from "../core/diff.js";
import { highlightCode, TOKEN_COLORS } from "../core/highlight.js";

// ─── Colors ───

const RAIL_COLORS = {
  context: "#333",
  add: "#2d5",
  remove: "#f44",
  collapsed: "#555",
} as const;

const HEADER_ACCENT = "#9B30FF";
const HEADER_SEP = "#333";
const HEADER_PATH = "#ccc";
const GUTTER_COLOR = "#444";
const COLLAPSED_COLOR = "#555";
const FOOTER_COLOR = "#333";
const ERROR_COLOR = "#f44";

const LARGE_DIFF_THRESHOLD = 50;

// ─── Props ───

interface Props {
  filePath: string;
  oldString: string;
  newString: string;
  success: boolean;
  errorMessage?: string;
}

// ─── DiffLineRow ───

function DiffLineRow({ line, lang }: { line: DiffLine; lang: string }) {
  if (line.kind === "collapsed") {
    return (
      <Box minHeight={1} flexShrink={0}>
        <Text color={RAIL_COLORS.context}>│</Text>
        <Text color={COLLAPSED_COLOR}>
          {"       ⋯ "}
          {line.collapsedCount} lines
        </Text>
      </Box>
    );
  }

  const railColor = RAIL_COLORS[line.kind];
  const marker = line.kind === "remove" ? "-" : line.kind === "add" ? "+" : " ";
  const markerColor =
    line.kind === "remove"
      ? RAIL_COLORS.remove
      : line.kind === "add"
        ? RAIL_COLORS.add
        : RAIL_COLORS.context;
  const lineNum = line.kind === "remove" ? line.oldNum : line.newNum;
  const numStr = lineNum != null ? String(lineNum).padStart(4, " ") : "    ";
  const dim = line.kind !== "add";

  // Syntax highlight the content
  const tokens = highlightCode(line.content, lang)[0] ?? [
    { text: line.content, role: "plain" as const },
  ];

  return (
    <Box minHeight={1} flexShrink={0}>
      <Text>
        <Text color={railColor}>│</Text>
        <Text color={markerColor}>{marker}</Text>
        <Text color={GUTTER_COLOR}>{numStr} </Text>
        {tokens.map((tok, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable token order
          <Text key={i} color={TOKEN_COLORS[tok.role]} dimColor={dim}>
            {tok.text}
          </Text>
        ))}
      </Text>
    </Box>
  );
}

// ─── Main Component ───

export function DiffView({ filePath, oldString, newString, success, errorMessage }: Props) {
  // Compute actual file line number where the edit starts
  const startLine = useMemo(() => {
    try {
      const content = readFileSync(filePath, "utf-8");
      // File now contains newString (edit already applied)
      const idx = content.indexOf(newString);
      if (idx >= 0) return content.slice(0, idx).split("\n").length;
      // Fallback: try oldString (file may have been reverted)
      const idx2 = content.indexOf(oldString);
      if (idx2 >= 0) return content.slice(0, idx2).split("\n").length;
    } catch {
      // File not readable
    }
    return 1;
  }, [filePath, oldString, newString]);

  const computed = useMemo(() => {
    if (!success) return null;
    return computeDiff(oldString, newString, startLine);
  }, [oldString, newString, success, startLine]);

  const lang = useMemo(() => langFromPath(filePath), [filePath]);

  const isLarge = computed != null && computed.added + computed.removed > LARGE_DIFF_THRESHOLD;

  // ─── Header ───
  const verb = !success ? "Edit" : computed?.isCreation ? "New" : "Edit";
  const icon = !success ? "✗" : "✎";
  const iconColor = !success ? ERROR_COLOR : HEADER_ACCENT;

  // Count text
  let counts = "";
  if (success && computed) {
    const parts: string[] = [];
    if (computed.added > 0) parts.push(`+${computed.added}`);
    if (computed.removed > 0) parts.push(`─${computed.removed}`);
    counts = parts.join(" ");
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box minHeight={1} flexShrink={0}>
        <Text>
          <Text color={HEADER_SEP}>┌ </Text>
          <Text color={iconColor}>{icon} </Text>
          <Text color={HEADER_ACCENT} bold>
            {verb}
          </Text>
          <Text color={HEADER_SEP}> ─── </Text>
          <Text color={HEADER_PATH}>{filePath}</Text>
          {counts ? (
            <Text>
              <Text color={HEADER_SEP}> ─── </Text>
              {computed && computed.added > 0 ? (
                <Text color={RAIL_COLORS.add}>+{computed.added}</Text>
              ) : null}
              {computed && computed.added > 0 && computed.removed > 0 ? (
                <Text color={HEADER_SEP}> </Text>
              ) : null}
              {computed && computed.removed > 0 ? (
                <Text color={RAIL_COLORS.remove}>─{computed.removed}</Text>
              ) : null}
            </Text>
          ) : null}
        </Text>
      </Box>

      {/* Body */}
      {!success ? (
        // Failed edit
        <Box minHeight={1} flexShrink={0}>
          <Text>
            <Text color={HEADER_SEP}>│</Text>
            <Text color={ERROR_COLOR}> {errorMessage ?? "old_string not found in file"}</Text>
          </Text>
        </Box>
      ) : isLarge ? (
        // Large diff — summary only
        <Box minHeight={1} flexShrink={0}>
          <Text>
            <Text color={HEADER_SEP}>│</Text>
            <Text color={COLLAPSED_COLOR}> {computed.added + computed.removed} lines changed</Text>
          </Text>
        </Box>
      ) : computed ? (
        // Normal diff body
        <>
          <Box minHeight={1} flexShrink={0}>
            <Text color={HEADER_SEP}>│</Text>
          </Box>
          {computed.lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable diff lines
            <DiffLineRow key={i} line={line} lang={lang} />
          ))}
        </>
      ) : null}

      {/* Footer */}
      <Box minHeight={1} flexShrink={0}>
        <Text color={FOOTER_COLOR}>└───────</Text>
      </Box>
    </Box>
  );
}
