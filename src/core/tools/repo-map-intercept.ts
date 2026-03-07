import { relative } from "node:path";
import type { RepoMap } from "../intelligence/repo-map.js";

export interface InterceptResult {
  intercepted: true;
  success: true;
  output: string;
  /** Signals the UI to show this as a repo-map interception */
  repoMapHit: true;
}

interface GrepArgs {
  pattern: string;
  path?: string;
  glob?: string;
}

interface NavigateArgs {
  action: string;
  symbol?: string;
  query?: string;
  file?: string;
  scope?: string;
}

const INTERCEPTABLE_NAVIGATE_ACTIONS = new Set(["workspace_symbols", "search_symbols"]);
const MIN_SYMBOL_LEN = 3;
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function isCleanIdentifier(pattern: string): string | null {
  const cleaned = pattern.replace(/[\\^$.*+?()[\]{}|]/g, "");
  if (cleaned.length < MIN_SYMBOL_LEN) return null;
  if (!IDENTIFIER_RE.test(cleaned)) return null;
  return cleaned;
}

function formatMatches(
  matches: Array<{ path: string; kind: string; isExported: boolean; pagerank: number }>,
  cwd: string,
): string {
  return matches
    .map((m) => {
      const rel = relative(cwd, m.path);
      const exp = m.isExported ? "+" : " ";
      return `  ${exp} ${rel} (${m.kind})`;
    })
    .join("\n");
}

export function tryInterceptGrep(
  args: GrepArgs,
  repoMap: RepoMap | undefined,
  cwd: string,
): InterceptResult | null {
  if (!repoMap || !repoMap.isReady) return null;

  // Skip when scoped searches — those are legitimate usage lookups
  if (args.glob || args.path) return null;

  // Handle compound patterns: "Foo|Bar" — check each part
  const parts = args.pattern.split("|");
  if (parts.length > 1) {
    // For compound patterns, add hints but don't block
    return null;
  }

  const symbolName = isCleanIdentifier(args.pattern);
  if (!symbolName) return null;

  const matches = repoMap.findSymbols(symbolName);
  if (matches.length === 0) return null;

  const matchList = formatMatches(matches, cwd);
  const bestMatch = matches[0] as { path: string; kind: string };
  const bestRel = relative(cwd, bestMatch.path);

  const output =
    matches.length === 1
      ? `REPO MAP — "${symbolName}" is indexed at ${bestRel} (${bestMatch.kind}). ` +
        `Use read_code(target, "${symbolName}", "${bestRel}") to read it directly. ` +
        `Grep was skipped — the repo map already knows this symbol's location.`
      : `REPO MAP — "${symbolName}" found in ${String(matches.length)} files:\n${matchList}\n` +
        `Use read_code with the correct file path. Grep was skipped.`;

  return { intercepted: true, success: true, output, repoMapHit: true };
}

export function tryInterceptNavigate(
  args: NavigateArgs,
  repoMap: RepoMap | undefined,
  cwd: string,
): InterceptResult | null {
  if (!repoMap || !repoMap.isReady) return null;

  if (!INTERCEPTABLE_NAVIGATE_ACTIONS.has(args.action)) return null;

  const query = args.query ?? args.symbol;
  if (!query) return null;

  const symbolName = isCleanIdentifier(query);
  if (!symbolName) return null;

  const matches = repoMap.findSymbols(symbolName);
  if (matches.length === 0) return null;

  const matchList = formatMatches(matches, cwd);
  const bestMatch = matches[0] as { path: string; kind: string };
  const bestRel = relative(cwd, bestMatch.path);

  const output =
    matches.length === 1
      ? `REPO MAP — "${symbolName}" is indexed at ${bestRel} (${bestMatch.kind}). ` +
        `Use read_code(target, "${symbolName}", "${bestRel}") directly. ` +
        `${args.action} was skipped.`
      : `REPO MAP — "${symbolName}" found in ${String(matches.length)} files:\n${matchList}\n` +
        `Use read_code with the correct file. ${args.action} was skipped.`;

  return { intercepted: true, success: true, output, repoMapHit: true };
}
