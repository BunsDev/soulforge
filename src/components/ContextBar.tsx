import { fg as fgStyle, StyledText, type TextRenderable } from "@opentui/core";
import { useEffect, useMemo, useRef } from "react";
import type { ContextManager } from "../core/context/manager.js";
import { getModelContextInfo } from "../core/llm/models.js";
import { useStatusBarStore } from "../stores/statusbar.js";

const BAR_WIDTH = 8;
const CHARS_PER_TOKEN = 4;
const STEP_MS = 50;
const EASE = 0.35;

function approach(current: number, target: number): number {
  if (current === target) return target;
  const next = current + (target - current) * EASE;
  return Math.abs(next - target) < 1 ? target : Math.round(next);
}

function getBarColor(pct: number): string {
  if (pct < 50) return "#1a6";
  if (pct < 70) return "#a07018";
  if (pct < 85) return "#b06000";
  return "#b0002e";
}

function getPctColor(pct: number): string {
  if (pct < 50) return "#176";
  if (pct < 70) return "#7a5510";
  if (pct < 85) return "#884a00";
  return "#881020";
}

function getFlashColor(pct: number): string {
  if (pct < 50) return "#1a6";
  if (pct < 70) return "#a07018";
  if (pct < 85) return "#b06000";
  return "#b0002e";
}

function formatWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k`;
  return String(tokens);
}

interface BarTarget {
  pct: number;
  tokensX10: number;
  windowSource: string;
  flash: boolean;
}

function buildContent(
  pct: number,
  tokensK: string,
  windowLabel: string,
  windowSource: string,
  flash: boolean,
): StyledText {
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const barColor = getBarColor(pct);
  const pulse = pct > 80;

  const pctColor = flash ? getFlashColor(pct) : getPctColor(pct);
  const chunks = [
    fgStyle("#444")("ctx"),
    fgStyle("#333")("["),
    fgStyle(pulse ? "#b0002e" : barColor)("▰".repeat(filled)),
    fgStyle("#222")("▱".repeat(empty)),
    fgStyle("#333")("]"),
    fgStyle(pctColor)(`${String(pct)}%`),
    fgStyle("#444")(` ${tokensK}k/${windowLabel}`),
  ];
  if (windowSource === "api") chunks.push(fgStyle("#1a6")(" ✓"));
  if (windowSource === "fallback") chunks.push(fgStyle("#a07018")(" ~"));
  return new StyledText(chunks);
}

interface Props {
  contextManager: ContextManager;
  modelId: string;
}

export function ContextBar({ contextManager, modelId }: Props) {
  const textRef = useRef<TextRenderable>(null);

  const ctxInfo = useMemo(() => getModelContextInfo(modelId), [modelId]);
  const windowLabel = formatWindow(ctxInfo.tokens);

  const targetRef = useRef<BarTarget>({
    pct: 0,
    tokensX10: 0,
    windowSource: ctxInfo.source,
    flash: false,
  });
  const prevTotalRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return useStatusBarStore.subscribe((state) => {
      const isApi = state.contextTokens > 0;
      const breakdown = contextManager.getContextBreakdown();
      const systemChars = breakdown.reduce((sum, s) => sum + s.chars, 0);
      const charEstimate = (systemChars + state.chatChars + state.subagentChars) / CHARS_PER_TOKEN;
      const totalTokens = isApi
        ? state.contextTokens + state.subagentChars / CHARS_PER_TOKEN
        : charEstimate;
      const windowSource = isApi ? "api" : ctxInfo.source;
      const rawPct = (totalTokens / ctxInfo.tokens) * 100;
      const pct = totalTokens > 0 ? Math.min(100, Math.max(1, Math.round(rawPct))) : 0;
      const tokensX10 = Math.round(totalTokens / 100);

      let flash = targetRef.current.flash;
      if (totalTokens > prevTotalRef.current + 50) {
        flash = true;
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => {
          targetRef.current = { ...targetRef.current, flash: false };
        }, 500);
      }
      prevTotalRef.current = totalTokens;

      targetRef.current = { pct, tokensX10, windowSource, flash };
    });
  }, [contextManager, ctxInfo]);

  const currentPctRef = useRef(0);
  const currentTokensRef = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => {
      const target = targetRef.current;
      const pct = approach(currentPctRef.current, target.pct);
      const tok = approach(currentTokensRef.current, target.tokensX10);
      if (pct === currentPctRef.current && tok === currentTokensRef.current && !target.flash)
        return;
      currentPctRef.current = pct;
      currentTokensRef.current = tok;
      try {
        if (textRef.current) {
          textRef.current.content = buildContent(
            pct,
            (tok / 10).toFixed(1),
            windowLabel,
            target.windowSource,
            target.flash,
          );
        }
      } catch {}
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [windowLabel]);

  const initial = buildContent(0, "0.0", windowLabel, ctxInfo.source, false);
  return <text ref={textRef} truncate content={initial} />;
}
