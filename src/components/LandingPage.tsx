import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { icon, providerIcon } from "../core/icons.js";
import type { ProviderStatus } from "../core/llm/provider.js";
import type { PrerequisiteStatus } from "../core/setup/prerequisites.js";

const PURPLE = "#9B30FF";
const RED = "#FF0040";
const FAINT = "#222";
const MUTED = "#555";
const SUBTLE = "#444";
const GREEN = "#2d5";

const WORDMARK = [
  "┌─┐┌─┐┬ ┬┬  ┌─┐┌─┐┬─┐┌─┐┌─┐",
  "└─┐│ ││ ││  ├┤ │ │├┬┘│ ┬├┤ ",
  "└─┘└─┘└─┘┴─┘└  └─┘┴└─└─┘└─┘",
];

const GHOST_SPEED = 500;
const CURSOR_FRAMES = ["█", "▓", "▒", "░", " ", "░", "▒", "▓"];

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function GradientLine({ text, from, to }: { text: string; from: string; to: string }) {
  const len = text.length;
  if (len === 0) return null;

  const segments: { chars: string; color: string }[] = [];
  const CHUNK = 4;

  for (let i = 0; i < len; i += CHUNK) {
    const slice = text.slice(i, i + CHUNK);
    const t = len > 1 ? i / (len - 1) : 0;
    const color = lerpHex(from, to, t);
    segments.push({ chars: slice, color });
  }

  return (
    <box flexDirection="row">
      {segments.map((seg, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable gradient segments
        <text key={i} fg={seg.color} attributes={TextAttributes.BOLD}>
          {seg.chars}
        </text>
      ))}
    </box>
  );
}

interface LandingPageProps {
  bootProviders: ProviderStatus[];
  bootPrereqs: PrerequisiteStatus[];
}

export function LandingPage({ bootProviders, bootPrereqs }: LandingPageProps) {
  const { width, height } = useTerminalDimensions();
  const columns = width ?? 80;
  const rows = height ?? 24;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), GHOST_SPEED);
    return () => clearInterval(t);
  }, []);

  const compact = rows < 20;

  const showWordmark = columns >= 35;
  const wordmarkW = showWordmark ? (WORDMARK[0]?.length ?? 0) : 0;

  const activeProviders = bootProviders.filter((p) => p.available);
  const inactiveProviders = bootProviders.filter((p) => !p.available);
  const missingRequired = bootPrereqs.filter((p) => !p.installed && p.prerequisite.required);
  const allToolsOk = bootPrereqs.every((p) => p.installed || !p.prerequisite.required);
  const anyProvider = activeProviders.length > 0;

  const maxProviderWidth = Math.floor(columns * 0.6);
  const { visible: visibleProviders, overflow: providerOverflow } = fitProviders(
    activeProviders,
    inactiveProviders,
    maxProviderWidth,
  );

  const divW = Math.min(wordmarkW || 30, columns - 8);
  const cursorFrame = CURSOR_FRAMES[Math.floor(tick * 3) % CURSOR_FRAMES.length];

  return (
    <box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} justifyContent="center">
      <box flexDirection="column" alignItems="center" gap={0}>
        <text fg={PURPLE} attributes={TextAttributes.BOLD}>
          {`${icon("ghost")} ${icon("ghost")} ${icon("ghost")}`}
        </text>

        <box height={compact ? 0 : 1} />

        {showWordmark ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable wordmark rows
          WORDMARK.map((line, i) => <GradientLine key={i} text={line} from={PURPLE} to={RED} />)
        ) : (
          <text fg={PURPLE} attributes={TextAttributes.BOLD}>
            SOULFORGE
          </text>
        )}

        <box flexDirection="row" gap={0}>
          <text fg={SUBTLE}>{"── "}</text>
          <text fg={MUTED} attributes={TextAttributes.ITALIC}>
            AI-Powered Terminal IDE
          </text>
          <text fg={SUBTLE}>{" ──"}</text>
        </box>

        <box height={compact ? 0 : 1} />
        <text fg={FAINT}>{"─".repeat(divW)}</text>
        <box height={compact ? 0 : 1} />

        <box flexDirection="row" gap={0} justifyContent="center" flexWrap="wrap">
          {visibleProviders.map((p, i) => (
            <box key={p.id} flexDirection="row" gap={0}>
              {i > 0 && <text fg={FAINT}>{" · "}</text>}
              <text fg={p.available ? GREEN : SUBTLE}>
                {providerIcon(p.id)} {p.name}
              </text>
            </box>
          ))}
          {providerOverflow > 0 && (
            <>
              <text fg={FAINT}>{" · "}</text>
              <text fg={SUBTLE}>+{providerOverflow}</text>
            </>
          )}
        </box>

        <box flexDirection="row" gap={0} justifyContent="center">
          {allToolsOk ? (
            <text fg={MUTED}>{icon("check")} all tools ready</text>
          ) : (
            bootPrereqs.map((t, i) => (
              <box key={t.prerequisite.name} flexDirection="row" gap={0}>
                {i > 0 && <text fg={FAINT}>{" · "}</text>}
                <text fg={t.installed ? GREEN : t.prerequisite.required ? RED : "#FF8C00"}>
                  {t.installed ? icon("check") : "○"} {t.prerequisite.name}
                </text>
              </box>
            ))
          )}
        </box>

        {(missingRequired.length > 0 || !anyProvider) && (
          <text fg={SUBTLE}>/setup to configure</text>
        )}

        <box height={compact ? 0 : 1} />
        <text fg={FAINT}>{"─".repeat(divW)}</text>
        {!compact && <box height={1} />}

        <box flexDirection="row" gap={1} justifyContent="center" flexWrap="wrap">
          <Cmd name="help" />
          <Cmd name="open" arg="<file>" />
          <Cmd name="editor" />
          <Cmd name="skills" />
          <Cmd name="setup" />
        </box>

        <box height={compact ? 0 : 1} />

        <box flexDirection="row" gap={1}>
          <text fg={MUTED}>ask anything below</text>
          <text fg={RED}>{cursorFrame}</text>
        </box>
      </box>
    </box>
  );
}

function Cmd({ name, arg }: { name: string; arg?: string }) {
  return (
    <box flexDirection="row" gap={0}>
      <text fg={RED}>/</text>
      <text fg="#777">{name}</text>
      {arg && <text fg={SUBTLE}> {arg}</text>}
    </box>
  );
}

function fitProviders(
  active: ProviderStatus[],
  inactive: ProviderStatus[],
  maxWidth: number,
): { visible: ProviderStatus[]; overflow: number } {
  const all = [...active, ...inactive];
  if (all.length === 0) return { visible: [], overflow: 0 };

  const visible: ProviderStatus[] = [];
  let usedWidth = 0;

  for (const p of all) {
    const entryWidth = (visible.length > 0 ? 3 : 0) + 2 + p.name.length;
    const overflowWidth = all.length - visible.length > 1 ? 5 : 0;

    if (usedWidth + entryWidth + overflowWidth > maxWidth && visible.length >= 3) {
      break;
    }
    visible.push(p);
    usedWidth += entryWidth;
  }

  return {
    visible,
    overflow: all.length - visible.length,
  };
}
