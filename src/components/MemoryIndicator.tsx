import { fg as fgStyle, StyledText, type TextRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import { icon } from "../core/icons.js";
import { useStatusBarStore } from "../stores/statusbar.js";

const STEP_MS = 50;
const EASE = 0.35;

function approach(current: number, target: number): number {
  if (current === target) return target;
  const next = current + (target - current) * EASE;
  return Math.abs(next - target) < 1 ? target : Math.round(next);
}

function getMemColor(mb: number): string {
  if (mb < 2048) return "#4a7";
  if (mb < 4096) return "#b87333";
  return "#f44";
}

function fmtMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${String(mb)}MB`;
}

function buildContent(mb: number): StyledText {
  return new StyledText([
    fgStyle("#555")(icon("memory")),
    fgStyle(getMemColor(mb))(` ${fmtMem(mb)}`),
  ]);
}

export function MemoryIndicator() {
  const textRef = useRef<TextRenderable>(null);

  const targetRef = useRef(useStatusBarStore.getState().rssMB);
  useEffect(() => useStatusBarStore.subscribe((state) => (targetRef.current = state.rssMB)), []);

  const currentRef = useRef(targetRef.current);
  useEffect(() => {
    const timer = setInterval(() => {
      const target = targetRef.current;
      if (currentRef.current === target) return;
      currentRef.current = approach(currentRef.current, target);
      try {
        if (textRef.current) textRef.current.content = buildContent(currentRef.current);
      } catch {}
    }, STEP_MS);
    return () => clearInterval(timer);
  }, []);

  return <text ref={textRef} truncate content={buildContent(currentRef.current)} />;
}
