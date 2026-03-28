import { TextAttributes } from "@opentui/core";
import { getThemeTokens } from "../../../core/theme/index.js";

/** Wizard color constants — derived from active theme via getters */
export const C = new Proxy(
  {} as {
    readonly purple: string;
    readonly cyan: string;
    readonly red: string;
    readonly green: string;
    readonly amber: string;
    readonly text: string;
    readonly muted: string;
    readonly subtle: string;
    readonly faint: string;
    readonly white: string;
  },
  {
    get(_target, prop: string) {
      if (prop === "white") return "white";
      const t = getThemeTokens();
      const map: Record<string, string> = {
        purple: t.brand,
        cyan: t.info,
        red: t.brandSecondary,
        green: t.success,
        amber: t.warning,
        text: t.textSecondary,
        muted: t.textMuted,
        subtle: t.textDim,
        faint: t.textFaint,
      };
      return map[prop] ?? "";
    },
  },
);

export const BOLD = TextAttributes.BOLD;
export const ITALIC = TextAttributes.ITALIC;
