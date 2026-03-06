import { TextAttributes } from "@opentui/core";
import { useEffect, useRef, useState } from "react";
import { BRAND_PURPLE, BRAND_RED, type BrandSegment } from "./splash.js";

const PHRASES: BrandSegment[][] = [
  [
    { text: "by ", color: "#333" },
    { text: "Proxy", color: BRAND_PURPLE },
    { text: "Soul", color: BRAND_RED },
  ],
  [
    { text: "proxy", color: BRAND_PURPLE },
    { text: "soul", color: BRAND_RED },
    { text: ".com", color: "#555" },
  ],
];

const FIXED_WIDTH = Math.max(...PHRASES.map((p) => p.reduce((n, s) => n + s.text.length, 0))) + 1;
const HOLD_MS = 12_000;
const TYPE_MS = 45;
const ERASE_MS = 30;

function plainLength(segs: BrandSegment[]): number {
  return segs.reduce((n, s) => n + s.text.length, 0);
}

type Phase = "hold" | "erase" | "type" | "pause";

export function BrandTag() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [visibleChars, setVisibleChars] = useState(0);
  const [phase, setPhase] = useState<Phase>("type");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phrase = PHRASES[phraseIdx] ?? PHRASES[0] ?? [];
  const totalChars = plainLength(phrase);
  const animating = phase === "erase" || phase === "type" || phase === "pause";

  useEffect(() => {
    if (phase === "hold") {
      timerRef.current = setTimeout(() => setPhase("erase"), HOLD_MS);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    if (phase === "erase") {
      if (visibleChars <= 0) {
        setPhraseIdx((i) => (i + 1) % PHRASES.length);
        setVisibleChars(0);
        setPhase("pause");
        return;
      }
      timerRef.current = setTimeout(() => setVisibleChars((v) => v - 1), ERASE_MS);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    if (phase === "pause") {
      timerRef.current = setTimeout(() => setPhase("type"), 200);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    // phase === "type"
    if (visibleChars >= totalChars) {
      setPhase("hold");
      return;
    }
    timerRef.current = setTimeout(() => setVisibleChars((v) => v + 1), TYPE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, visibleChars, totalChars]);

  let remaining = visibleChars;
  const parts: { text: string; color: string }[] = [];
  for (const seg of phrase) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, seg.text.length);
    parts.push({ text: seg.text.slice(0, take), color: seg.color });
    remaining -= take;
  }

  const pad = FIXED_WIDTH - visibleChars - (animating ? 1 : 0);

  return (
    <box width={FIXED_WIDTH} flexShrink={0}>
      <text attributes={TextAttributes.ITALIC}>
        {pad > 0 && <span>{" ".repeat(pad)}</span>}
        {parts.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable segments
          <span key={i} fg={p.color}>
            {p.text}
          </span>
        ))}
        {animating && <span fg={BRAND_RED}>█</span>}
      </text>
    </box>
  );
}
