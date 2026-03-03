import { Text } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ContextManager } from "../core/context/manager.js";
import { getModelContextWindow } from "../core/llm/models.js";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";

const BAR_WIDTH = 12;
// Rough char-to-token ratio: ~4 chars per token
const CHARS_PER_TOKEN = 4;

function getBarColor(pct: number): string {
  if (pct < 50) return "#2d5";
  if (pct < 75) return "#FF8C00";
  return "#FF0040";
}

function formatWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k`;
  return String(tokens);
}

interface Props {
  contextManager: ContextManager;
  chatChars: number;
  modelId: string;
}

export function ContextBar({ contextManager, chatChars, modelId }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((p) => p + 1), 2_000);
    return () => clearInterval(interval);
  }, []);

  const contextWindowTokens = useMemo(() => getModelContextWindow(modelId), [modelId]);
  const maxContextChars = contextWindowTokens * CHARS_PER_TOKEN;

  const breakdown = contextManager.getContextBreakdown();
  const systemChars = breakdown.reduce((sum, s) => sum + s.chars, 0);
  const totalChars = systemChars + chatChars;
  const rawPct = (totalChars / maxContextChars) * 100;
  // For large context windows (200k+), Math.round loses small values → stuck at 0%.
  // Show at least 1% once there's any real content, and use 1 decimal for < 10%.
  const pct = totalChars > 0 ? Math.min(100, Math.max(1, Math.round(rawPct))) : 0;
  const totalKbRaw = totalChars / 1024;

  // Animate the percentage and kb values
  const animPct = useAnimatedNumber(pct);
  const animKbX10 = useAnimatedNumber(Math.round(totalKbRaw * 10));
  const animKb = (animKbX10 / 10).toFixed(1);

  // Flash when context jumps
  const [flash, setFlash] = useState(false);
  const prevChars = useRef(totalChars);
  useEffect(() => {
    if (totalChars > prevChars.current + 100) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 500);
      prevChars.current = totalChars;
      return () => clearTimeout(timer);
    }
    prevChars.current = totalChars;
    return undefined;
  }, [totalChars]);

  const filled = Math.round((animPct / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const barColor = getBarColor(animPct);
  const pulse = pct > 80 && tick % 2 === 0;

  return (
    <Text wrap="truncate">
      <Text color="#555">ctx</Text>
      <Text color="#333">[</Text>
      <Text color={pulse ? "#FF0040" : barColor}>{"█".repeat(filled)}</Text>
      <Text color="#222">{"░".repeat(empty)}</Text>
      <Text color="#333">]</Text>
      <Text color={flash ? "#fff" : barColor} bold={flash}>
        {String(animPct)}%
      </Text>
      <Text color="#555">
        {" "}
        {animKb}k/{formatWindow(contextWindowTokens)}
      </Text>
    </Text>
  );
}
