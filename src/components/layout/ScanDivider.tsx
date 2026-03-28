import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../core/theme/index.js";

/** Animated divider — a bright cursor sweeps across a dim line. */
export function ScanDivider({ width: w, speed = 120 }: { width: number; speed?: number }) {
  const t = useTheme();
  const [pos, setPos] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setPos((p) => (p + 1) % (w + 6)), speed);
    return () => clearInterval(timer);
  }, [w, speed]);

  const chars = useMemo(() => {
    const out: { ch: string; color: string }[] = [];
    for (let i = 0; i < w; i++) {
      const dist = Math.abs(i - pos);
      if (dist === 0) out.push({ ch: "━", color: t.brandAlt });
      else if (dist === 1) out.push({ ch: "─", color: t.brand });
      else if (dist === 2) out.push({ ch: "─", color: t.brandDim });
      else out.push({ ch: "─", color: t.bgPopupHighlight });
    }
    return out;
  }, [pos, w, t]);

  return (
    <box flexDirection="row">
      {chars.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional divider chars
        <text key={i} fg={c.color}>
          {c.ch}
        </text>
      ))}
    </box>
  );
}
