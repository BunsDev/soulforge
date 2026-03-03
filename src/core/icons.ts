import { getProvider } from "./llm/providers/index.js";

export const UI_ICONS = {
  ghost: "󰊠", //  nf-md-ghost              U+F02A0  — SoulForge branding
  editor: "󰞍", // nf-md-pencil              U+F078D
  chat: "󰍩", //  nf-md-message_text         U+F0369
  folder: "󰉋", // nf-md-folder_open         U+F024B
  brain: "󰘦", //  nf-md-head_cog            U+F0626  — LLM/intelligence
  user: "󰀄", //   nf-md-account             U+F0004
  ai: "󰚩", //     nf-md-robot               U+F06A9
  system: "󰒓", // nf-md-cog                 U+F0493
  tokens: "󰨇", // nf-md-lightning_bolt      U+F0A07
  sparkle: "󰩟", // nf-md-star_four_points   U+F0A5F
  arrow: "󰅂", //  nf-md-chevron_right       U+F0142
  clock: "󰥔", //  nf-md-clock_outline       U+F0954
  git: "󰊢", //    nf-md-source_branch       U+F02A2
  tools: "󰠭", //  nf-md-hammer_wrench       U+F082D
} as const;

export function providerIcon(providerId: string): string {
  return getProvider(providerId)?.icon ?? "●";
}
