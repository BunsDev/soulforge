// ─── Syntax Highlight with Shiki ───

import { type BundledLanguage, createHighlighter, type ThemedToken } from "shiki";

export type TokenRole =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "type"
  | "punctuation"
  | "function"
  | "plain";

export interface Token {
  text: string;
  role: TokenRole;
  color?: string;
}

/** Fallback colors when Shiki isn't ready yet */
export const TOKEN_COLORS: Record<TokenRole, string> = {
  keyword: "#FF79C6",
  string: "#F1FA8C",
  comment: "#6272A4",
  number: "#BD93F9",
  type: "#8BE9FD",
  punctuation: "#888",
  function: "#50FA7B",
  plain: "#e0e0e0",
};

// ─── Shiki singleton ───

const SHIKI_THEME = "dracula";
const PRELOAD_LANGS: BundledLanguage[] = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "python",
  "bash",
  "json",
  "css",
  "go",
  "rust",
  "html",
  "yaml",
  "toml",
  "markdown",
  "lua",
  "sql",
  "diff",
  "c",
  "cpp",
  "java",
  "ruby",
  "swift",
];

// Lang alias map
const LANG_ALIASES: Record<string, BundledLanguage> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  sh: "bash",
  zsh: "bash",
  shell: "bash",
  golang: "go",
  rs: "rust",
  yml: "yaml",
  rb: "ruby",
  scss: "css",
  md: "markdown",
};

type ShikiHighlighter = Awaited<ReturnType<typeof createHighlighter>>;
let highlighterInstance: ShikiHighlighter | null = null;
let highlighterReady = false;

// Fire-and-forget initialization — non-blocking
const initPromise = createHighlighter({
  themes: [SHIKI_THEME],
  langs: PRELOAD_LANGS,
}).then((h) => {
  highlighterInstance = h;
  highlighterReady = true;
});

/** Ensure highlighter is ready (call from async contexts if needed) */
export async function ensureHighlighter(): Promise<void> {
  await initPromise;
}

// ─── Convert Shiki tokens to our Token format ───

function shikiTokensToTokens(lines: ThemedToken[][]): Token[][] {
  return lines.map((lineTokens) => {
    if (lineTokens.length === 0) return [{ text: "", role: "plain" as const }];
    return lineTokens.map((t) => ({
      text: t.content,
      role: "plain" as TokenRole,
      color: t.color ?? TOKEN_COLORS.plain,
    }));
  });
}

// ─── Simple fallback tokenizer (no regex grammars, just plain text) ───

function fallbackHighlight(code: string): Token[][] {
  return code.split("\n").map((line) => [{ text: line, role: "plain" as const }]);
}

// ─── Public API ───

export function highlightCode(code: string, lang: string): Token[][] {
  if (!highlighterReady || !highlighterInstance) {
    return fallbackHighlight(code);
  }

  const resolved = LANG_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();

  try {
    const result = highlighterInstance.codeToTokens(code, {
      lang: resolved as BundledLanguage,
      theme: SHIKI_THEME,
    });
    return shikiTokensToTokens(result.tokens);
  } catch {
    // Unknown language — fall back to plain
    return fallbackHighlight(code);
  }
}
