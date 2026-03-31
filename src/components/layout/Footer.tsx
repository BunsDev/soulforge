import { useTerminalDimensions } from "@opentui/react";
import { icon } from "../../core/icons.js";
import { useTheme } from "../../core/theme/index.js";

// Priority tiers:
//   1 = always show (core actions, no git/quit/stop)
//   2 = medium screens
//   3 = wide only
// labelShort = truncated label for medium screens
interface ShortcutDef {
  k: string;
  ic: string;
  l: string;
  ls: string; // short label
  tier: 1 | 2 | 3;
}

const SHORTCUTS: ShortcutDef[] = [
  { k: "^K", ic: icon("lightning"), l: "Palette", ls: "Palette", tier: 1 },
  { k: "^L", ic: icon("brain_alt"), l: "LLM", ls: "LLM", tier: 1 },
  { k: "^D", ic: icon("cog"), l: "Mode", ls: "Mode", tier: 1 },
  { k: "^E", ic: icon("pencil"), l: "Editor", ls: "Editor", tier: 2 },
  { k: "^S", ic: icon("skills"), l: "Skills", ls: "Skills", tier: 2 },
  { k: "^G", ic: icon("git"), l: "Git", ls: "Git", tier: 2 },
  { k: "^N", ic: icon("ghost"), l: "New Session", ls: "New", tier: 3 },
  { k: "^P", ic: icon("clock_alt"), l: "Sessions", ls: "Sessions", tier: 3 },
  { k: "^T", ic: icon("tabs"), l: "Tab", ls: "Tab", tier: 3 },
  { k: "^C", ic: icon("quit"), l: "Quit", ls: "Quit", tier: 3 },
];

// Estimate rendered width of a shortcut item: "^X icon label" + trailing gap
// key=2, space=1, icon=1, space+label=optional, gap=trailing
function itemWidth(label: string, gap: number): number {
  return 2 + 1 + 1 + (label ? 1 + label.length : 0) + gap;
}

type LabelMode = "full" | "short" | "none";

function calcWidth(tier: number, mode: LabelMode, gap: number): number {
  const items = SHORTCUTS.filter((s) => s.tier <= tier);
  const total = items.reduce((sum, s, i) => {
    const lbl = mode === "full" ? s.l : mode === "short" ? s.ls : "";
    return sum + itemWidth(lbl, i < items.length - 1 ? gap : 0);
  }, 0);
  return total + 2; // paddingX={1} on each side
}

export function Footer() {
  const { width } = useTerminalDimensions();
  const t = useTheme();

  const GAP = 2;

  // Find the best (tier, labelMode) combo that fits on one line.
  // Try tier 3→2→1, and for each try full→short→icons-only label modes.
  let maxTier: 1 | 2 | 3 = 1;
  let labelMode: LabelMode = "none";
  let found = false;

  outer: for (const tier of [3, 2, 1] as const) {
    for (const mode of ["full", "short", "none"] as LabelMode[]) {
      const gap = mode === "none" ? 1 : GAP;
      if (calcWidth(tier, mode, gap) <= width) {
        maxTier = tier;
        labelMode = mode;
        found = true;
        break outer;
      }
    }
  }

  // Fallback: tier 1 icons-only always renders (even if it overflows slightly)
  if (!found) {
    maxTier = 1;
    labelMode = "none";
  }

  const visible = SHORTCUTS.filter((s) => s.tier <= maxTier);
  const showLabels = labelMode !== "none";

  return (
    <box
      flexDirection="row"
      justifyContent="center"
      paddingX={1}
      width="100%"
      gap={showLabels ? GAP : 1}
    >
      {visible.map((s) => (
        <text key={s.k}>
          <span fg={t.textMuted}>
            <b>{s.k}</b>
          </span>
          <span fg={t.textDim}>
            {" "}
            {s.ic}
            {showLabels ? ` ${labelMode === "full" ? s.l : s.ls}` : ""}
          </span>
        </text>
      ))}
    </box>
  );
}
