import { TextAttributes } from "@opentui/core";
import { memo, useEffect, useRef, useState } from "react";
import type { ScreenSegment } from "../core/editor/screen.js";
import { UI_ICONS } from "../core/icons.js";

interface Props {
  isOpen: boolean;
  fileName: string | null;
  screenLines: ScreenSegment[][];
  defaultBg?: string;
  modeName?: string;
  focused?: boolean;
  cursorLine?: number;
  cursorCol?: number;
  onClosed?: () => void;
  showHints?: boolean;
}

type Direction = "opening" | "idle";
const ANIMATION_FRAMES = ["  ░", " ░▒", "░▒▓", "▒▓█", "▓██", "███"];

const MODE_COLORS: Record<string, string> = {
  normal: "#6A0DAD",
  insert: "#00AA00",
  visual: "#FF8C00",
  "visual line": "#FF8C00",
  "visual block": "#FF8C00",
  replace: "#FF0040",
  command: "#4488FF",
  cmdline_normal: "#4488FF",
  terminal: "#888888",
};

function modeLabel(mode: string): string {
  if (mode.startsWith("cmdline")) return "COMMAND";
  return mode.toUpperCase().replace("_", " ");
}

const ScreenRow = memo(function ScreenRow({
  segments,
  bg,
}: {
  segments: ScreenSegment[];
  bg: string | undefined;
}) {
  return (
    <box flexDirection="row">
      {segments.map((seg, j) => {
        let attrs = 0;
        if (seg.bold) attrs |= TextAttributes.BOLD;
        if (seg.italic) attrs |= TextAttributes.ITALIC;
        if (seg.underline) attrs |= TextAttributes.UNDERLINE;
        if (seg.strikethrough) attrs |= TextAttributes.STRIKETHROUGH;
        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
            key={j}
            fg={seg.fg}
            bg={seg.bg ?? bg}
            attributes={attrs || undefined}
          >
            {seg.text}
          </text>
        );
      })}
    </box>
  );
});

export const EditorPanel = memo(function EditorPanel({
  isOpen,
  fileName,
  screenLines,
  defaultBg,
  modeName = "normal",
  focused = false,
  cursorLine,
  cursorCol,
  onClosed,
  showHints = true,
}: Props) {
  const [animFrame, setAnimFrame] = useState(0);
  const [direction, setDirection] = useState<Direction>("idle");
  const prevOpen = useRef(isOpen);

  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      prevOpen.current = true;
      setDirection("opening");
      setAnimFrame(0);
    } else if (!isOpen && prevOpen.current) {
      prevOpen.current = false;
      onClosed?.();
    }
  }, [isOpen, onClosed]);

  useEffect(() => {
    if (direction !== "opening") return;
    const interval = setInterval(() => {
      setAnimFrame((prev) => {
        if (prev >= ANIMATION_FRAMES.length - 1) {
          clearInterval(interval);
          setDirection("idle");
          return prev;
        }
        return prev + 1;
      });
    }, 60);
    return () => clearInterval(interval);
  }, [direction]);

  if (!isOpen && direction === "idle") {
    return null;
  }

  const borderColor = focused ? "#FF0040" : "#6A0DAD";

  if (direction === "opening") {
    return (
      <box
        flexDirection="column"
        width="60%"
        borderStyle="rounded"
        border={true}
        borderColor={borderColor}
        alignItems="center"
        justifyContent="center"
      >
        <text fg="#9B30FF">{ANIMATION_FRAMES[animFrame]}</text>
        <text fg="#444" attributes={TextAttributes.DIM}>
          loading forge...
        </text>
      </box>
    );
  }

  const displayName = fileName ? (fileName.split("/").pop() ?? fileName) : "no file";
  const bg = defaultBg;
  const modeColor = MODE_COLORS[modeName] ?? "#6A0DAD";

  return (
    <box
      flexDirection="column"
      width="60%"
      borderStyle="rounded"
      border={true}
      borderColor={borderColor}
    >
      <box
        flexDirection="row"
        paddingX={1}
        justifyContent="space-between"
        flexShrink={0}
        height={1}
      >
        <box flexDirection="row">
          <text bg={focused ? "#FF0040" : "#6A0DAD"} fg="white" attributes={TextAttributes.BOLD}>
            {` ${UI_ICONS.editor} `}
          </text>
          <text fg="#888"> {displayName}</text>
        </box>
        <text>
          <span fg={modeColor}>{"\uE0B6"}</span>
          <span bg={modeColor} fg="white" attributes={TextAttributes.BOLD}>
            {` ${modeLabel(modeName)} `}
          </span>
          <span fg={modeColor}>{"\uE0B4"}</span>
        </text>
      </box>
      <box paddingX={1} flexShrink={0} height={1}>
        <text fg="#333" truncate>
          {"─".repeat(200)}
        </text>
      </box>

      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {screenLines.length === 0 ? (
          <box justifyContent="center" alignItems="center" flexGrow={1}>
            <text fg="#333">waiting for nvim...</text>
          </box>
        ) : (
          screenLines.map((segments, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable screen rows
            <ScreenRow key={row} segments={segments} bg={bg} />
          ))
        )}
      </box>

      <box paddingX={1} flexShrink={0} height={1}>
        <text fg="#333" truncate>
          {"─".repeat(200)}
        </text>
      </box>
      {showHints && <VimHints mode={modeName} />}
      <box
        flexDirection="row"
        paddingX={1}
        justifyContent="space-between"
        flexShrink={0}
        height={1}
      >
        <text fg="#555" truncate>
          {fileName ?? ""}
        </text>
        <box flexDirection="row" gap={2}>
          {cursorLine != null && (
            <text fg="#666">
              {String(cursorLine)}:{String((cursorCol ?? 0) + 1)}
            </text>
          )}
          <text fg="#555" attributes={TextAttributes.BOLD}>
            nvim
          </text>
        </box>
      </box>
    </box>
  );
});

function VimHints({ mode }: { mode: string }) {
  const isInsert = mode === "insert";
  const isVisual = mode.startsWith("visual");

  return (
    <box flexDirection="column" paddingX={1} flexShrink={0}>
      <box flexDirection="row" height={1} gap={2}>
        <H k="i" l="insert" on={isInsert} />
        <H k="Esc" l="normal" on={!isInsert && !isVisual} />
        <H k=":w" l="save" />
        <H k=":q" l="quit" />
        <H k=":wq" l="save & quit" />
        <H k="u" l="undo" />
        <H k="^R" l="redo" />
        <H k="/" l="search" />
        <H k="n" l="next match" />
      </box>
      <box flexDirection="row" height={1} gap={2}>
        <H k="dd" l="del line" />
        <H k="yy" l="copy line" />
        <H k="p" l="paste" />
        <H k="o" l="line below" />
        <H k="v" l="select" on={isVisual} />
        <H k="gg" l="top" />
        <H k="G" l="bottom" />
        <H k="w" l="next word" />
        <text fg="#333">/vim-hints to hide</text>
      </box>
    </box>
  );
}

function H({ k, l, on }: { k: string; l: string; on?: boolean }) {
  return (
    <text>
      <span fg={on ? "#00AA00" : "#FF0040"} attributes={on ? TextAttributes.BOLD : undefined}>
        {k}
      </span>
      <span fg="#444"> {l}</span>
    </text>
  );
}
