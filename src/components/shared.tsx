import { useEffect, useState } from "react";

export const POPUP_BG = "#111122";
export const POPUP_HL = "#1a1a3e";

export type ConfigScope = "session" | "project" | "global";
export const CONFIG_SCOPES: ConfigScope[] = ["session", "project", "global"];

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

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

let globalFrame = 0;
const listeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function startTick() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    globalFrame = (globalFrame + 1) % SPINNER_FRAMES.length;
    for (const cb of listeners) cb();
  }, 120);
}

function stopTick() {
  if (tickTimer !== null && listeners.size === 0) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

export function useSpinnerFrame(enabled = true): number {
  const [frame, setFrame] = useState(globalFrame);
  useEffect(() => {
    if (!enabled) return;
    const cb = () => setFrame(globalFrame);
    listeners.add(cb);
    startTick();
    return () => {
      listeners.delete(cb);
      stopTick();
    };
  }, [enabled]);
  return frame;
}

export function Spinner({
  frames = SPINNER_FRAMES,
  color = "#FF0040",
}: {
  frames?: string[];
  color?: string;
} = {}) {
  const frame = useSpinnerFrame();
  return <text fg={color}>{frames[frame % frames.length]}</text>;
}

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
    <box width={w} height={1} overflow="hidden">
      <box position="absolute">
        <text bg={fill}>{" ".repeat(w)}</text>
      </box>
      <box position="absolute" width={w} flexDirection="row">
        <text bg={fill}>{"  "}</text>
        {children}
      </box>
    </box>
  );
}
