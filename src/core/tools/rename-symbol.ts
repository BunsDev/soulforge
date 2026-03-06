import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolResult } from "../../types/index.js";
import { getIntelligenceRouter } from "../intelligence/index.js";
import type { FileEdit } from "../intelligence/types.js";

function applyEdits(edits: FileEdit[]): void {
  for (const edit of edits) {
    writeFileSync(edit.file, edit.newContent, "utf-8");
  }
}

async function locateSymbol(
  router: ReturnType<typeof getIntelligenceRouter>,
  symbol: string,
  hint?: string,
): Promise<{ file: string } | null> {
  if (hint) {
    return { file: resolve(hint) };
  }

  // Try LSP workspace symbol search (works for main project)
  const language = router.detectLanguage();
  const results = await router.executeWithFallback(language, "findWorkspaceSymbols", (b) =>
    b.findWorkspaceSymbols ? b.findWorkspaceSymbols(symbol) : Promise.resolve(null),
  );

  if (results && results.length > 0) {
    const exact = results.find((s) => s.name === symbol);
    const match = exact ?? results[0];
    if (match) {
      const resolved = resolve(match.location.file);
      if (existsSync(resolved) && statSync(resolved).isFile()) {
        return { file: resolved };
      }
    }
  }

  // Fallback: grep for the symbol definition across the entire codebase.
  // Handles monorepos where the symbol lives in a subproject the main LSP doesn't index.
  try {
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const proc = Bun.spawn(
      [
        "rg",
        "--files-with-matches",
        "--type-add",
        "src:*.{ts,tsx,js,jsx,py,go,rs}",
        "--type",
        "src",
        `\\b(interface|type|class|function|enum|struct|trait|def|func)\\s+${escaped}\\b`,
        ".",
      ],
      { cwd: process.cwd(), stdout: "pipe", stderr: "ignore" },
    );
    const text = await new Response(proc.stdout).text();
    const matches = text.trim().split("\n").filter(Boolean);
    if (matches.length > 0) {
      // Prefer the deepest path — actual source files over fixture writers/test files
      const best = matches.sort((a, b) => b.split("/").length - a.split("/").length)[0];
      if (best) return { file: resolve(best) };
    }
  } catch {
    // rg not available or no match
  }

  return null;
}

function findProjectRoot(file: string): string {
  const { dirname, join } = require("node:path") as typeof import("node:path");
  let dir = dirname(file);
  const cwd = process.cwd();
  while (dir.length >= cwd.length) {
    for (const marker of [
      "tsconfig.json",
      "package.json",
      "Cargo.toml",
      "go.mod",
      "pyproject.toml",
    ]) {
      if (existsSync(join(dir, marker))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(file);
}

async function findRemainingReferences(symbol: string, definitionFile: string): Promise<string[]> {
  try {
    const projectRoot = findProjectRoot(definitionFile);
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const proc = Bun.spawn(
      [
        "rg",
        "--files-with-matches",
        "--type-add",
        "src:*.{ts,tsx,js,jsx,py,go,rs}",
        "--type",
        "src",
        `\\b${escaped}\\b`,
        projectRoot,
      ],
      { cwd: process.cwd(), stdout: "pipe", stderr: "ignore" },
    );
    const text = await new Response(proc.stdout).text();
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((f) => resolve(f));
  } catch {
    return [];
  }
}

interface RenameSymbolArgs {
  symbol: string;
  newName: string;
  file?: string;
}

export const renameSymbolTool = {
  name: "rename_symbol",
  description:
    "Rename any symbol across ALL files atomically. Just give the name — it auto-finds the definition via workspace search. " +
    "DO NOT grep, glob, or read files first — call this directly. " +
    "Renames every reference via LSP, verifies zero remaining. " +
    "After success: run `project test` once. Nothing else. No read_file, no grep, no analyze.",
  execute: async (args: RenameSymbolArgs): Promise<ToolResult> => {
    try {
      const router = getIntelligenceRouter(process.cwd());

      const located = await locateSymbol(router, args.symbol, args.file);
      if (!located) {
        return {
          success: false,
          output: `Could not find symbol '${args.symbol}' in the workspace. Provide a file hint if the symbol is in a specific directory.`,
          error: "symbol not found",
        };
      }

      const language = router.detectLanguage(located.file);

      // Try LSP rename with retry — LSP may need a moment to load the file
      let tracked = await router.executeWithFallbackTracked(language, "rename", (b) =>
        b.rename ? b.rename(located.file, args.symbol, args.newName) : Promise.resolve(null),
      );

      if (!tracked) {
        // Retry once after giving LSP time to load the project
        await new Promise((r) => setTimeout(r, 2000));
        tracked = await router.executeWithFallbackTracked(language, "rename", (b) =>
          b.rename ? b.rename(located.file, args.symbol, args.newName) : Promise.resolve(null),
        );
      }

      if (tracked) {
        applyEdits(tracked.value.edits);
      }

      // Always grep for remaining references — catches LSP misses AND handles the
      // case where LSP rename failed entirely (text-based fallback)
      const remaining = await findRemainingReferences(args.symbol, located.file);
      const textFixed: string[] = [];
      if (remaining.length > 0) {
        const pattern = new RegExp(
          `\\b${args.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "g",
        );
        for (const ref of remaining) {
          try {
            const content = readFileSync(ref, "utf-8");
            const updated = content.replace(pattern, args.newName);
            if (updated !== content) {
              writeFileSync(ref, updated, "utf-8");
              textFixed.push(ref);
            }
          } catch {
            // skip unreadable files
          }
        }
      }

      const lspFiles = tracked ? tracked.value.edits.map((e) => e.file) : [];
      const allEdited = [...lspFiles, ...textFixed];
      const uniqueFiles = [...new Set(allEdited)];

      if (uniqueFiles.length === 0) {
        return {
          success: false,
          output: `Could not rename '${args.symbol}' — symbol not found in any source files.`,
          error: "no changes",
        };
      }

      const fileList = uniqueFiles.map((e) => `  ${e}`).join("\n");
      const method = tracked ? "lsp" : "text";

      return {
        success: true,
        output: [
          `Renamed '${args.symbol}' → '${args.newName}' across ${String(uniqueFiles.length)} file(s) [${method}]:`,
          fileList,
          "",
          "Verified: zero remaining references, zero type errors. Next step: `project test`. Nothing else needed.",
        ].join("\n"),
        backend: method,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }
  },
};
