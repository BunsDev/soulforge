import type { ForgeMode } from "../types/index.js";

export const MODE_ORDER: ForgeMode[] = [
  "default",
  "architect",
  "socratic",
  "challenge",
  "plan",
  "auto",
];

export const MODE_LABELS: Record<ForgeMode, string> = {
  default: "Default",
  architect: "Architect",
  socratic: "Socratic",
  challenge: "Challenge",
  plan: "Plan",
  auto: "Auto",
};

export const MODE_COLORS: Record<ForgeMode, string> = {
  default: "#555",
  architect: "#9B30FF",
  socratic: "#FF8C00",
  challenge: "#FF0040",
  plan: "#00BFFF",
  auto: "#2d5",
};

export function getModeLabel(mode: ForgeMode): string {
  return MODE_LABELS[mode];
}

export function getModeColor(mode: ForgeMode): string {
  return MODE_COLORS[mode];
}

export function cycleForgeMode(current: ForgeMode): ForgeMode {
  const idx = MODE_ORDER.indexOf(current);
  return MODE_ORDER[(idx + 1) % MODE_ORDER.length] ?? "default";
}
