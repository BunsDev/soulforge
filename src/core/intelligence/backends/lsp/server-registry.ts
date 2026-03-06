// ─── LSP Server Registry ───

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Language } from "../../types.js";

export interface LspServerConfig {
  command: string;
  args: string[];
  language: Language;
}

interface ServerCandidate {
  command: string;
  args: string[];
}

const SERVER_CANDIDATES: Record<string, ServerCandidate[]> = {
  typescript: [{ command: "typescript-language-server", args: ["--stdio"] }],
  javascript: [{ command: "typescript-language-server", args: ["--stdio"] }],
  python: [
    { command: "pyright-langserver", args: ["--stdio"] },
    { command: "pylsp", args: [] },
  ],
  go: [{ command: "gopls", args: ["serve"] }],
  rust: [{ command: "rust-analyzer", args: [] }],
};

/** Mason installs LSP servers here */
const MASON_BIN_DIR = join(homedir(), ".local", "share", "nvim", "mason", "bin");

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Check if a command exists in Mason's bin directory */
function commandExistsInMason(cmd: string): string | null {
  const fullPath = join(MASON_BIN_DIR, cmd);
  return existsSync(fullPath) ? fullPath : null;
}

/** Cache of resolved commands: name → absolute path (or name if on PATH) */
const probeCache = new Map<string, string | null>();

/**
 * Resolve a command name to an executable path.
 * Checks $PATH first, then Mason's bin directory.
 * Returns the resolved command string or null if not found.
 */
function resolveCommand(cmd: string): string | null {
  const cached = probeCache.get(cmd);
  if (cached !== undefined) return cached;

  // 1. Check $PATH
  if (commandExists(cmd)) {
    probeCache.set(cmd, cmd);
    return cmd;
  }

  // 2. Check Mason's install directory
  const masonPath = commandExistsInMason(cmd);
  if (masonPath) {
    probeCache.set(cmd, masonPath);
    return masonPath;
  }

  probeCache.set(cmd, null);
  return null;
}

/**
 * Find an LSP server for the given language.
 * Probes $PATH first, then Mason's bin directory (~/.local/share/nvim/mason/bin/).
 */
export function findServerForLanguage(language: Language): LspServerConfig | null {
  const candidates = SERVER_CANDIDATES[language];
  if (!candidates) return null;

  for (const candidate of candidates) {
    const resolved = resolveCommand(candidate.command);
    if (resolved) {
      return {
        command: resolved,
        args: candidate.args,
        language,
      };
    }
  }

  return null;
}

/** Clear the probe cache (useful for testing) */
export function clearProbeCache(): void {
  probeCache.clear();
}
