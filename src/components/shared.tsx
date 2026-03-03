import { Box, Text } from "ink";
import { useEffect, useState } from "react";

// ─── Popup Colors ───

export const POPUP_BG = "#111122";
export const POPUP_HL = "#1a1a3e";

// ─── Spinner Frames ───

/** Standard braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Filled braille spinner (⣋⣙⣹⣸⣼⣴⣦⣧⣇⣏) */
export const SPINNER_FRAMES_FILLED = [
  "\u28CB",
  "\u28D9",
  "\u28F9",
  "\u28F8",
  "\u28FC",
  "\u28F4",
  "\u28E6",
  "\u28E7",
  "\u28C7",
  "\u28CF",
];

// ─── Spinner Component ───

export function Spinner({
  frames = SPINNER_FRAMES,
  color = "#FF0040",
  interval = 80,
}: {
  frames?: string[];
  color?: string;
  interval?: number;
} = {}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(timer);
  }, [frames.length, interval]);
  return <Text color={color}>{frames[idx]}</Text>;
}

// ─── PopupRow Component ───

/**
 * A single row inside a popup with a full-width solid background.
 * Uses position="absolute" to layer a background fill behind the content,
 * since Ink's Box doesn't support backgroundColor directly.
 */
export function PopupRow({
  children,
  bg,
  w,
}: {
  children: React.ReactNode;
  bg?: string;
  w: number;
}) {
  const fill = bg ?? POPUP_BG;
  return (
    <Box width={w} height={1}>
      <Box position="absolute">
        <Text backgroundColor={fill}>{" ".repeat(w)}</Text>
      </Box>
      <Box position="absolute">
        <Text backgroundColor={fill}>{"  "}</Text>
        {children}
      </Box>
    </Box>
  );
}
