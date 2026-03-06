import { resolve } from "node:path";
import type { ToolResult } from "../../types/index.js";
import { getIntelligenceRouter } from "../intelligence/index.js";
import type { CallHierarchyItem, SourceLocation, SymbolInfo } from "../intelligence/types.js";

type NavigateAction =
  | "definition"
  | "references"
  | "symbols"
  | "imports"
  | "exports"
  | "workspace_symbols"
  | "call_hierarchy"
  | "implementation"
  | "type_hierarchy"
  | "search_symbols";

interface NavigateArgs {
  action: NavigateAction;
  symbol?: string;
  file?: string;
  scope?: string;
  query?: string;
}

function formatLocation(loc: SourceLocation): string {
  const end = loc.endLine ? `-${String(loc.endLine)}` : "";
  return `${loc.file}:${String(loc.line)}${end}`;
}

function formatSymbol(s: SymbolInfo): string {
  const loc = `${s.location.file}:${String(s.location.line)}`;
  const container = s.containerName ? ` (in ${s.containerName})` : "";
  return `${s.kind} ${s.name}${container} — ${loc}`;
}

export const navigateTool = {
  name: "navigate",
  description:
    "Find where a symbol is defined, who calls it, what it imports/exports, and its type hierarchy. " +
    "THE primary tool for understanding code structure — use BEFORE grep for code questions. " +
    "Works without neovim — uses static analysis of the codebase.",
  execute: async (args: NavigateArgs): Promise<ToolResult> => {
    try {
      const router = getIntelligenceRouter(process.cwd());
      const file = args.file ? resolve(args.file) : undefined;
      const language = router.detectLanguage(file);
      const symbol = args.symbol;

      switch (args.action) {
        case "definition": {
          if (!symbol) {
            return {
              success: false,
              output: "symbol is required for definition lookup",
              error: "missing symbol",
            };
          }
          if (!file) {
            return {
              success: false,
              output: "file is required for definition lookup",
              error: "missing file",
            };
          }

          const tracked = await router.executeWithFallbackTracked(
            language,
            "findDefinition",
            (b) => (b.findDefinition ? b.findDefinition(file, symbol) : Promise.resolve(null)),
          );

          if (!tracked || tracked.value.length === 0) {
            return {
              success: false,
              output: `No definition found for '${symbol}'`,
              error: "not found",
            };
          }

          return {
            success: true,
            output: `Definition of '${symbol}':\n${tracked.value.map(formatLocation).join("\n")}`,
            backend: tracked.backend,
          };
        }

        case "references": {
          if (!symbol) {
            return {
              success: false,
              output: "symbol is required for references lookup",
              error: "missing symbol",
            };
          }
          if (!file) {
            return {
              success: false,
              output: "file is required for references lookup",
              error: "missing file",
            };
          }

          const tracked = await router.executeWithFallbackTracked(
            language,
            "findReferences",
            (b) => (b.findReferences ? b.findReferences(file, symbol) : Promise.resolve(null)),
          );

          if (!tracked || tracked.value.length === 0) {
            return {
              success: false,
              output: `No references found for '${symbol}'`,
              error: "not found",
            };
          }

          return {
            success: true,
            output: `References to '${symbol}' (${String(tracked.value.length)}):\n${tracked.value.map(formatLocation).join("\n")}`,
            backend: tracked.backend,
          };
        }

        case "symbols": {
          if (!file) {
            return {
              success: false,
              output: "file is required for symbol listing",
              error: "missing file",
            };
          }

          const tracked = await router.executeWithFallbackTracked(language, "findSymbols", (b) =>
            b.findSymbols ? b.findSymbols(file, args.scope) : Promise.resolve(null),
          );

          if (!tracked || tracked.value.length === 0) {
            return { success: true, output: "No symbols found" };
          }

          return {
            success: true,
            output: `Symbols in ${file} (${String(tracked.value.length)}):\n${tracked.value.map(formatSymbol).join("\n")}`,
            backend: tracked.backend,
          };
        }

        case "imports": {
          if (!file) {
            return {
              success: false,
              output: "file is required for import listing",
              error: "missing file",
            };
          }

          const tracked = await router.executeWithFallbackTracked(language, "findImports", (b) =>
            b.findImports ? b.findImports(file) : Promise.resolve(null),
          );

          if (!tracked || tracked.value.length === 0) {
            return { success: true, output: "No imports found" };
          }

          const lines = tracked.value.map((imp) => {
            const specs = imp.specifiers.length > 0 ? ` { ${imp.specifiers.join(", ")} }` : "";
            return `${imp.source}${specs} — line ${String(imp.location.line)}`;
          });
          return {
            success: true,
            output: `Imports in ${file} (${String(tracked.value.length)}):\n${lines.join("\n")}`,
            backend: tracked.backend,
          };
        }

        case "exports": {
          if (!file) {
            return {
              success: false,
              output: "file is required for export listing",
              error: "missing file",
            };
          }

          const tracked = await router.executeWithFallbackTracked(language, "findExports", (b) =>
            b.findExports ? b.findExports(file) : Promise.resolve(null),
          );

          if (!tracked || tracked.value.length === 0) {
            return { success: true, output: "No exports found" };
          }

          const lines = tracked.value.map((exp) => {
            const def = exp.isDefault ? " (default)" : "";
            return `${exp.kind} ${exp.name}${def} — line ${String(exp.location.line)}`;
          });
          return {
            success: true,
            output: `Exports from ${file} (${String(tracked.value.length)}):\n${lines.join("\n")}`,
            backend: tracked.backend,
          };
        }

        case "workspace_symbols": {
          const query = args.query ?? args.symbol ?? "";
          if (!query) {
            return {
              success: false,
              output: "query or symbol is required for workspace_symbols",
              error: "missing query",
            };
          }

          const tracked = await router.executeWithFallbackTracked(
            language,
            "findWorkspaceSymbols",
            (b) => (b.findWorkspaceSymbols ? b.findWorkspaceSymbols(query) : Promise.resolve(null)),
          );

          if (!tracked || tracked.value.length === 0) {
            return { success: true, output: `No workspace symbols matching '${query}'` };
          }

          return {
            success: true,
            output: `Workspace symbols matching '${query}' (${String(tracked.value.length)}):\n${tracked.value.map(formatSymbol).join("\n")}`,
            backend: tracked.backend,
          };
        }

        case "call_hierarchy": {
          if (!symbol) {
            return {
              success: false,
              output: "symbol is required for call_hierarchy",
              error: "missing symbol",
            };
          }
          if (!file) {
            return {
              success: false,
              output: "file is required for call_hierarchy",
              error: "missing file",
            };
          }

          const tracked = await router.executeWithFallbackTracked(
            language,
            "getCallHierarchy",
            (b) => (b.getCallHierarchy ? b.getCallHierarchy(file, symbol) : Promise.resolve(null)),
          );

          if (!tracked) {
            return {
              success: false,
              output: `No call hierarchy for '${symbol}'`,
              error: "not found",
            };
          }

          const ch = tracked.value;
          const formatCH = (i: CallHierarchyItem) =>
            `${i.kind} ${i.name} — ${i.file}:${String(i.line)}`;
          const parts = [`Call hierarchy for ${ch.item.name}:`];
          if (ch.incoming.length > 0) {
            parts.push(`\nIncoming calls (${String(ch.incoming.length)}):`);
            parts.push(...ch.incoming.map((i) => `  ${formatCH(i)}`));
          }
          if (ch.outgoing.length > 0) {
            parts.push(`\nOutgoing calls (${String(ch.outgoing.length)}):`);
            parts.push(...ch.outgoing.map((i) => `  ${formatCH(i)}`));
          }
          if (ch.incoming.length === 0 && ch.outgoing.length === 0) {
            parts.push("  No incoming or outgoing calls found.");
          }

          return {
            success: true,
            output: parts.join("\n"),
            backend: tracked.backend,
          };
        }

        case "implementation": {
          if (!symbol) {
            return {
              success: false,
              output: "symbol is required for implementation lookup",
              error: "missing symbol",
            };
          }
          if (!file) {
            return {
              success: false,
              output: "file is required for implementation lookup",
              error: "missing file",
            };
          }

          const tracked = await router.executeWithFallbackTracked(
            language,
            "findImplementation",
            (b) =>
              b.findImplementation ? b.findImplementation(file, symbol) : Promise.resolve(null),
          );

          if (!tracked || tracked.value.length === 0) {
            return {
              success: false,
              output: `No implementations found for '${symbol}'`,
              error: "not found",
            };
          }

          return {
            success: true,
            output: `Implementations of '${symbol}' (${String(tracked.value.length)}):\n${tracked.value.map(formatLocation).join("\n")}`,
            backend: tracked.backend,
          };
        }

        case "type_hierarchy": {
          if (!symbol) {
            return {
              success: false,
              output: "symbol is required for type_hierarchy",
              error: "missing symbol",
            };
          }
          if (!file) {
            return {
              success: false,
              output: "file is required for type_hierarchy",
              error: "missing file",
            };
          }

          const tracked = await router.executeWithFallbackTracked(
            language,
            "getTypeHierarchy",
            (b) => (b.getTypeHierarchy ? b.getTypeHierarchy(file, symbol) : Promise.resolve(null)),
          );

          if (!tracked) {
            return {
              success: false,
              output: `No type hierarchy for '${symbol}'`,
              error: "not found",
            };
          }

          const th = tracked.value;
          const parts = [`Type hierarchy for ${th.item.name} (${th.item.kind}):`];
          if (th.supertypes.length > 0) {
            parts.push(`\nSupertypes (${String(th.supertypes.length)}):`);
            for (const s of th.supertypes) {
              parts.push(`  ${s.kind} ${s.name} — ${s.file}:${String(s.line)}`);
            }
          }
          if (th.subtypes.length > 0) {
            parts.push(`\nSubtypes (${String(th.subtypes.length)}):`);
            for (const s of th.subtypes) {
              parts.push(`  ${s.kind} ${s.name} — ${s.file}:${String(s.line)}`);
            }
          }
          if (th.supertypes.length === 0 && th.subtypes.length === 0) {
            parts.push("  No supertypes or subtypes found.");
          }

          return {
            success: true,
            output: parts.join("\n"),
            backend: tracked.backend,
          };
        }

        case "search_symbols": {
          const query = args.query ?? args.symbol ?? "";
          if (!query) {
            return {
              success: false,
              output: "query or symbol is required for search_symbols",
              error: "missing query",
            };
          }

          // Try workspace symbols first (LSP), then fall back to symbol index
          const tracked = await router.executeWithFallbackTracked(
            language,
            "findWorkspaceSymbols",
            (b) => (b.findWorkspaceSymbols ? b.findWorkspaceSymbols(query) : Promise.resolve(null)),
          );

          if (!tracked || tracked.value.length === 0) {
            return { success: true, output: `No symbols matching '${query}'` };
          }

          return {
            success: true,
            output: `Symbols matching '${query}' (${String(tracked.value.length)}):\n${tracked.value.map(formatSymbol).join("\n")}`,
            backend: tracked.backend,
          };
        }

        default:
          return {
            success: false,
            output: `Unknown action: ${args.action as string}`,
            error: "invalid action",
          };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }
  },
};
