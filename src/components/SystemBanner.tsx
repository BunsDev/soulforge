import { Box, Text, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types/index.js";

// ─── Constants ───
const DISMISS_DELAY = 5000; // normal messages auto-dismiss after 5s
const ERROR_DISMISS_DELAY = 8000; // errors linger longer
const EXPANDED_DISMISS_DELAY = 12000; // expanded banners stay longer
const SLIDE_INTERVAL = 20; // ms per animation frame
const FADE_DURATION = 600; // ms for fade-out
const FADE_STEPS = 8;

// ─── Fade color interpolation ───
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const v = Number.parseInt(n, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function lerpColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  );
}

// ─── Classify message ───
function isError(text: string): boolean {
  return (
    text.startsWith("Error:") ||
    text.startsWith("Request failed:") ||
    text.startsWith("Failed") ||
    text.startsWith("Neovim error:")
  );
}

interface Props {
  messages: ChatMessage[];
  expanded?: boolean;
}

type Phase = "enter" | "visible" | "exit" | "hidden";

export function SystemBanner({ messages, expanded = false }: Props) {
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const [current, setCurrent] = useState<ChatMessage | null>(null);
  const [phase, setPhase] = useState<Phase>("hidden");
  const [revealCount, setRevealCount] = useState(0);
  const [fadeStep, setFadeStep] = useState(0);
  const lastSeenTs = useRef(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect new system messages
  useEffect(() => {
    const systemMsgs = messages.filter((m) => m.role === "system");
    if (systemMsgs.length === 0) return;
    const latest = systemMsgs[systemMsgs.length - 1] as ChatMessage | undefined;
    if (!latest || latest.timestamp <= lastSeenTs.current) return;

    lastSeenTs.current = latest.timestamp;

    // Cancel any pending dismiss
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }

    setCurrent(latest);
    setRevealCount(0);
    setFadeStep(0);
    setPhase("enter");
  }, [messages]);

  // Slide-in animation
  useEffect(() => {
    if (phase !== "enter" || !current) return;
    const text = current.content;
    // First line only for the banner
    const displayLen = (text.split("\n")[0] ?? "").length;
    if (revealCount >= displayLen) {
      setPhase("visible");
      return;
    }
    // Reveal in chunks for speed
    const chunkSize = Math.max(1, Math.ceil(displayLen / 12));
    const timer = setTimeout(() => {
      setRevealCount((c) => Math.min(c + chunkSize, displayLen));
    }, SLIDE_INTERVAL);
    return () => clearTimeout(timer);
  }, [phase, revealCount, current]);

  // Auto-dismiss timer — restart when expanded changes
  useEffect(() => {
    if (phase !== "visible" || !current) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    const baseDelay = isError(current.content) ? ERROR_DISMISS_DELAY : DISMISS_DELAY;
    const delay = expanded ? EXPANDED_DISMISS_DELAY : baseDelay;
    dismissTimer.current = setTimeout(() => {
      setPhase("exit");
      setFadeStep(0);
    }, delay);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [phase, current, expanded]);

  // Fade-out animation
  useEffect(() => {
    if (phase !== "exit") return;
    if (fadeStep >= FADE_STEPS) {
      setPhase("hidden");
      setCurrent(null);
      return;
    }
    const timer = setTimeout(() => {
      setFadeStep((s) => s + 1);
    }, FADE_DURATION / FADE_STEPS);
    return () => clearTimeout(timer);
  }, [phase, fadeStep]);

  if (phase === "hidden" || !current) return null;

  const err = isError(current.content);
  const allLines = current.content.split("\n");
  const firstLine = allLines[0] ?? "";
  const extraLines = allLines.slice(1);
  const multiLine = extraLines.length > 0;

  // Colors based on error state
  const bgColor = err ? "#3a1010" : "#1a1028";
  const accentColor = err ? "#f44" : "#9B30FF";
  const textColor = err ? "#faa" : "#c8b8e8";
  const iconColor = err ? "#f66" : "#b388ff";
  const dimColor = "#333";

  // Fade factor (0 = fully visible, 1 = fully faded)
  const fadeFactor = phase === "exit" ? fadeStep / FADE_STEPS : 0;

  // Interpolate colors toward background during fade
  const fadeTarget = "#111";
  const fAccent = lerpColor(accentColor, fadeTarget, fadeFactor);
  const fText = lerpColor(textColor, fadeTarget, fadeFactor);
  const fIcon = lerpColor(iconColor, fadeTarget, fadeFactor);
  const fDim = lerpColor(dimColor, fadeTarget, fadeFactor);
  const fBg = lerpColor(bgColor, "#000", fadeFactor);

  // Revealed text during enter phase
  const displayText = phase === "enter" ? firstLine.slice(0, revealCount) : firstLine;
  const showCursor = phase === "enter";

  // Icon
  const icon = err ? "✗" : "⚡";

  // Timestamp
  const time = new Date(current.timestamp).toLocaleTimeString("en-US", {
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
  });

  const showExpanded = expanded && multiLine && phase !== "enter";
  const bannerHeight = showExpanded ? 1 + extraLines.length : 1;

  return (
    <Box flexShrink={0} flexDirection="column" height={bannerHeight}>
      {/* First line */}
      <Box height={1} width={termWidth}>
        <Box position="absolute">
          <Text backgroundColor={fBg}>{" ".repeat(termWidth)}</Text>
        </Box>
        <Box position="absolute">
          <Text backgroundColor={fBg}>
            <Text color={fIcon}> {icon} </Text>
            <Text color={fAccent} bold>
              {err ? "Error" : "System"}
            </Text>
            <Text color={fDim}> │ </Text>
            <Text color={fText}>{displayText}</Text>
            {showCursor && <Text color={fAccent}>█</Text>}
            {multiLine && phase !== "enter" && !showExpanded && (
              <>
                <Text color={fDim}> (+{String(extraLines.length)} lines</Text>
                <Text color="#666"> ^O</Text>
                <Text color={fDim}>)</Text>
              </>
            )}
            <Text color={fDim}> · {time} </Text>
          </Text>
        </Box>
      </Box>
      {/* Expanded lines */}
      {showExpanded &&
        extraLines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable line order
          <Box key={i} height={1} width={termWidth}>
            <Box position="absolute">
              <Text backgroundColor={fBg}>{" ".repeat(termWidth)}</Text>
            </Box>
            <Box position="absolute">
              <Text backgroundColor={fBg}>
                <Text color={fDim}>{"    "} │ </Text>
                <Text color={fText}>{line}</Text>
              </Text>
            </Box>
          </Box>
        ))}
    </Box>
  );
}
