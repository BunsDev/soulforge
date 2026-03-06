import { Database } from "bun:sqlite";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { isForbidden } from "../security/forbidden.js";
import type { Language, SymbolKind } from "./types.js";

const INDEXABLE_EXTENSIONS: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".lua": "lua",
  ".ex": "elixir",
  ".exs": "elixir",
  ".dart": "dart",
  ".zig": "zig",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  // Config/data files — no AST symbols, but tracked in the map
  ".json": "unknown",
  ".yaml": "unknown",
  ".yml": "unknown",
  ".toml": "unknown",
  ".xml": "unknown",
  ".md": "unknown",
  ".css": "unknown",
  ".scss": "unknown",
  ".html": "unknown",
  ".sql": "unknown",
  ".graphql": "unknown",
  ".gql": "unknown",
  ".proto": "unknown",
  ".env": "unknown",
  ".conf": "unknown",
  ".ini": "unknown",
  ".cfg": "unknown",
  ".dockerfile": "unknown",
};

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  "__pycache__",
  "target",
  ".soulforge",
  ".cache",
]);

const MAX_FILE_SIZE = 500_000;
const MAX_DEPTH = 10;
const MAX_REFS_PER_FILE = 300;
const PAGERANK_ITERATIONS = 20;
const PAGERANK_DAMPING = 0.85;
const DEFAULT_TOKEN_BUDGET = 2500;
const MIN_TOKEN_BUDGET = 1500;
const MAX_TOKEN_BUDGET = 4000;
const DIRTY_DEBOUNCE_MS = 500;
const GIT_LOG_COMMITS = 300;
const MAX_COCHANGE_FILES_PER_COMMIT = 20;

const IDENTIFIER_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "class",
  "interface",
  "type",
  "export",
  "import",
  "from",
  "return",
  "async",
  "await",
  "new",
  "this",
  "super",
  "extends",
  "implements",
  "true",
  "false",
  "null",
  "undefined",
  "void",
  "string",
  "number",
  "boolean",
  "any",
  "never",
  "unknown",
  "for",
  "while",
  "if",
  "else",
  "switch",
  "case",
  "break",
  "continue",
  "try",
  "catch",
  "throw",
  "finally",
  "default",
  "static",
  "private",
  "public",
  "protected",
  "readonly",
  "abstract",
  "override",
  "typeof",
  "instanceof",
  "delete",
  "yield",
  "enum",
  "declare",
  "module",
  "namespace",
  "require",
  "def",
  "self",
  "None",
  "True",
  "False",
  "elif",
  "except",
  "raise",
  "pass",
  "with",
  "lambda",
  "func",
  "struct",
  "impl",
  "trait",
  "pub",
  "mod",
  "use",
  "crate",
  "mut",
  "ref",
  "match",
  "where",
  "package",
  "range",
  "defer",
  "chan",
  "select",
  "map",
  "make",
  "append",
  "len",
  "cap",
  "println",
  "fmt",
]);

interface FileRow {
  id: number;
  path: string;
  mtime_ms: number;
  language: string;
  line_count: number;
  symbol_count: number;
  pagerank: number;
}

interface SymbolRow {
  id: number;
  file_id: number;
  name: string;
  kind: string;
  line: number;
  end_line: number;
  is_exported: number;
  signature: string | null;
}

interface EdgeRow {
  source_file_id: number;
  target_file_id: number;
  weight: number;
}

export interface RepoMapOptions {
  tokenBudget?: number;
  mentionedFiles?: string[];
  editedFiles?: string[];
  editorFile?: string | null;
  conversationTerms?: string[];
  conversationTokens?: number;
}

export interface SymbolForSummary {
  name: string;
  kind: string;
  signature: string | null;
  code: string;
  filePath: string;
}

export type SummaryGenerator = (
  batch: SymbolForSummary[],
) => Promise<Array<{ name: string; summary: string }>>;

export class RepoMap {
  private db: Database;
  private cwd: string;
  private scanPromise: Promise<void> | null = null;
  private treeSitter:
    | typeof import("./backends/tree-sitter.js").TreeSitterBackend.prototype
    | null = null;
  private ready = false;
  private dirty = false;
  private dirtyTimer: ReturnType<typeof setTimeout> | null = null;
  private hasGit: boolean | null = null;
  private prevRenderedPaths: string[] = [];
  private semanticEnabled = false;
  private summaryGenerator: SummaryGenerator | null = null;
  onProgress: ((indexed: number, total: number) => void) | null = null;
  onScanComplete: ((success: boolean) => void) | null = null;

  constructor(cwd: string) {
    this.cwd = cwd;
    const dbDir = join(cwd, ".soulforge");
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

    const dbPath = join(dbDir, "repomap.db");
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        mtime_ms REAL NOT NULL,
        language TEXT NOT NULL,
        line_count INTEGER NOT NULL DEFAULT 0,
        symbol_count INTEGER NOT NULL DEFAULT 0,
        pagerank REAL NOT NULL DEFAULT 0.0
      );
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_files_pagerank ON files(pagerank DESC);
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        is_exported INTEGER NOT NULL DEFAULT 0,
        signature TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    `);

    // Migration: add signature column if missing
    try {
      this.db.run("ALTER TABLE symbols ADD COLUMN signature TEXT");
    } catch {
      // Column already exists
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS edges (
        source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        target_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        weight REAL NOT NULL DEFAULT 1.0,
        PRIMARY KEY (source_file_id, target_file_id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS refs (
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        name TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_refs_file ON refs(file_id);
      CREATE INDEX IF NOT EXISTS idx_refs_name ON refs(name);
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS cochanges (
        file_id_a INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        file_id_b INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (file_id_a, file_id_b)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS semantic_summaries (
        symbol_id INTEGER PRIMARY KEY REFERENCES symbols(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        file_mtime REAL NOT NULL
      );
    `);

    this.rebuildFts();
  }

  get isReady(): boolean {
    return this.ready;
  }

  async scan(): Promise<void> {
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = this.doScan();
    return this.scanPromise;
  }

  private async doScan(): Promise<void> {
    try {
      const files = collectFiles(this.cwd);

      const existingFiles = new Map<string, { id: number; mtime_ms: number }>();
      for (const row of this.db
        .query<{ id: number; path: string; mtime_ms: number }, []>(
          "SELECT id, path, mtime_ms FROM files",
        )
        .all()) {
        existingFiles.set(row.path, { id: row.id, mtime_ms: row.mtime_ms });
      }

      const currentPaths = new Set<string>();
      const toIndex: { absPath: string; relPath: string; mtime: number; language: Language }[] = [];

      for (const file of files) {
        const relPath = relative(this.cwd, file.path);
        currentPaths.add(relPath);

        const existing = existingFiles.get(relPath);
        if (existing && existing.mtime_ms === file.mtimeMs) continue;
        const ext = extname(file.path).toLowerCase();
        const language = INDEXABLE_EXTENSIONS[ext] ?? "unknown";
        toIndex.push({ absPath: file.path, relPath, mtime: file.mtimeMs, language });
      }

      const stale = [...existingFiles.keys()].filter((p) => !currentPaths.has(p));
      if (stale.length > 0) {
        const deleteFile = this.db.prepare("DELETE FROM files WHERE path = ?");
        const tx = this.db.transaction(() => {
          for (const p of stale) deleteFile.run(p);
        });
        tx();
      }

      if (toIndex.length > 0) {
        await this.ensureTreeSitter();
        for (let i = 0; i < toIndex.length; i++) {
          const file = toIndex[i];
          if (file) {
            try {
              await this.indexFile(file.absPath, file.relPath, file.mtime, file.language);
            } catch {
              // skip files that fail to index
            }
          }
          if (this.onProgress && i % 10 === 0) this.onProgress(i + 1, toIndex.length);
        }
        this.onProgress?.(toIndex.length, toIndex.length);
      }

      if (toIndex.length > 0 || stale.length > 0) {
        this.buildEdges();
        this.computePageRank();
      }

      this.buildCoChanges();

      this.ready = true;
      this.onScanComplete?.(true);
    } catch (err) {
      this.onScanComplete?.(false);
      throw err;
    } finally {
      this.scanPromise = null;
    }
  }

  private async ensureTreeSitter(): Promise<void> {
    if (this.treeSitter) return;
    try {
      const { TreeSitterBackend } = await import("./backends/tree-sitter.js");
      const backend = new TreeSitterBackend();
      await Promise.race([
        backend.initialize(this.cwd),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("tree-sitter init timeout")), 15_000),
        ),
      ]);
      this.treeSitter = backend;
    } catch {
      // tree-sitter unavailable — files will be indexed without AST symbols
    }
  }

  private async indexFile(
    absPath: string,
    relPath: string,
    mtime: number,
    language: Language,
  ): Promise<void> {
    const existing = this.db
      .query<{ id: number }, [string]>("SELECT id FROM files WHERE path = ?")
      .get(relPath);

    if (existing) {
      this.db.query("DELETE FROM symbols WHERE file_id = ?").run(existing.id);
      this.db.query("DELETE FROM refs WHERE file_id = ?").run(existing.id);
      this.db
        .query("DELETE FROM edges WHERE source_file_id = ? OR target_file_id = ?")
        .run(existing.id, existing.id);
    }

    let lineCount = 0;
    let content: string;
    try {
      content = require("node:fs").readFileSync(absPath, "utf-8");
      lineCount = content.split("\n").length;
    } catch {
      return;
    }

    let outline: import("./types.js").FileOutline | null = null;
    if (this.treeSitter) {
      try {
        outline =
          (await Promise.race([
            this.treeSitter.getFileOutline(absPath),
            new Promise<null>((r) => setTimeout(r, 5_000, null)),
          ])) ?? null;
      } catch {
        // skip file on parse error
      }
    }
    const symbolCount = outline?.symbols.length ?? 0;

    if (existing) {
      this.db
        .query(
          "UPDATE files SET mtime_ms = ?, language = ?, line_count = ?, symbol_count = ? WHERE id = ?",
        )
        .run(mtime, language, lineCount, symbolCount, existing.id);
    } else {
      this.db
        .query(
          "INSERT INTO files (path, mtime_ms, language, line_count, symbol_count) VALUES (?, ?, ?, ?, ?)",
        )
        .run(relPath, mtime, language, lineCount, symbolCount);
    }

    const fileId =
      existing?.id ??
      (this.db.query<{ id: number }, [string]>("SELECT id FROM files WHERE path = ?").get(relPath)
        ?.id as number);

    if (outline) {
      const insertSym = this.db.prepare(
        "INSERT INTO symbols (file_id, name, kind, line, end_line, is_exported, signature) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      const exportedNames = new Set(outline.exports.map((e) => e.name));
      const seen = new Set<string>();
      const lines = content.split("\n");

      const tx = this.db.transaction(() => {
        for (const sym of outline.symbols) {
          const key = `${sym.name}:${String(sym.location.line)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const sig = extractSignature(lines, sym.location.line - 1, sym.kind);
          insertSym.run(
            fileId,
            sym.name,
            sym.kind,
            sym.location.line,
            sym.location.endLine ?? sym.location.line,
            exportedNames.has(sym.name) ? 1 : 0,
            sig,
          );
        }
      });
      tx();
    }

    const identifiers = this.extractIdentifiers(content, language);
    if (identifiers.size > 0) {
      const insertRef = this.db.prepare("INSERT INTO refs (file_id, name) VALUES (?, ?)");
      const refs = [...identifiers].slice(0, MAX_REFS_PER_FILE);
      const tx = this.db.transaction(() => {
        for (const name of refs) {
          insertRef.run(fileId, name);
        }
      });
      tx();
    }
  }

  private extractIdentifiers(content: string, language: Language): Set<string> {
    const ids = new Set<string>();
    const patterns: RegExp[] = [];

    if (
      language === "typescript" ||
      language === "javascript" ||
      language === "go" ||
      language === "rust"
    ) {
      patterns.push(/\b([A-Z][a-zA-Z0-9_]*)\b/g);
      patterns.push(/\b([a-z][a-zA-Z0-9_]{2,})\b/g);
    } else if (language === "python") {
      patterns.push(/\b([A-Z][a-zA-Z0-9_]*)\b/g);
      patterns.push(/\b([a-z][a-z0-9_]{2,})\b/g);
    }

    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        const id = match[1];
        if (id && id.length > 2 && id.length < 60 && !IDENTIFIER_KEYWORDS.has(id)) {
          ids.add(id);
        }
      }
    }

    return ids;
  }

  private buildEdges(): void {
    this.db.run("DELETE FROM edges");

    const rows = this.db
      .query<
        {
          source_file_id: number;
          target_file_id: number;
          name: string;
          ref_count: number;
          def_count: number;
        },
        []
      >(
        `SELECT r.file_id AS source_file_id, s.file_id AS target_file_id,
                r.name, COUNT(*) AS ref_count,
                (SELECT COUNT(*) FROM symbols s2 WHERE s2.name = r.name AND s2.is_exported = 1) AS def_count
         FROM refs r
         JOIN symbols s ON r.name = s.name
         WHERE r.file_id != s.file_id
           AND s.is_exported = 1
         GROUP BY r.file_id, s.file_id, r.name`,
      )
      .all();

    const edgeWeights = new Map<string, number>();
    for (const row of rows) {
      let mul = 1.0;
      const name = row.name;
      const isCamelOrSnake = /[a-z][A-Z]/.test(name) || name.includes("_");
      if (isCamelOrSnake && name.length >= 8) mul *= 10;
      if (name.startsWith("_")) mul *= 0.1;
      if (row.def_count > 5) mul *= 0.1;
      const w = Math.sqrt(row.ref_count) * mul;

      const key = `${String(row.source_file_id)}:${String(row.target_file_id)}`;
      edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + w);
    }

    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO edges (source_file_id, target_file_id, weight) VALUES (?, ?, ?)",
    );
    const tx = this.db.transaction(() => {
      for (const [key, weight] of edgeWeights) {
        const [src, tgt] = key.split(":");
        insert.run(Number(src), Number(tgt), weight);
      }
    });
    tx();
  }

  private computePageRank(personalization?: Map<number, number>): void {
    const files = this.db.query<{ id: number }, []>("SELECT id FROM files").all();
    if (files.length === 0) return;

    const n = files.length;
    const idToIdx = new Map<number, number>();
    const ids: number[] = [];
    for (const file of files) {
      idToIdx.set(file.id, ids.length);
      ids.push(file.id);
    }

    const outWeight: number[] = new Array(n).fill(0);
    const adj: Array<{ from: number; to: number; weight: number }> = [];

    const edges = this.db
      .query<EdgeRow, []>("SELECT source_file_id, target_file_id, weight FROM edges")
      .all();

    for (const edge of edges) {
      const src = idToIdx.get(edge.source_file_id);
      const tgt = idToIdx.get(edge.target_file_id);
      if (src !== undefined && tgt !== undefined) {
        const w = edge.weight || 1;
        adj.push({ from: src, to: tgt, weight: w });
        outWeight[src] = (outWeight[src] ?? 0) + w;
      }
    }

    // Build personalization vector (teleport distribution)
    // Blend: 70% uniform baseline + 30% context boost for balanced ranking
    const pv = new Float64Array(n);
    const uniform = 1 / n;
    if (personalization && personalization.size > 0) {
      let boostSum = 0;
      for (const [fileId, boost] of personalization) {
        const idx = idToIdx.get(fileId);
        if (idx !== undefined) {
          pv[idx] = boost;
          boostSum += boost;
        }
      }
      if (boostSum > 0) {
        for (let i = 0; i < n; i++) {
          pv[i] = 0.7 * uniform + 0.3 * ((pv[i] ?? 0) / boostSum);
        }
      } else {
        pv.fill(uniform);
      }
    } else {
      pv.fill(uniform);
    }

    let rank = new Float64Array(n).fill(1 / n);
    let next = new Float64Array(n);

    for (let iter = 0; iter < PAGERANK_ITERATIONS; iter++) {
      // Teleport to personalization distribution instead of uniform
      for (let j = 0; j < n; j++) next[j] = (1 - PAGERANK_DAMPING) * (pv[j] ?? 0);

      let danglingSum = 0;
      for (let i = 0; i < n; i++) {
        if ((outWeight[i] ?? 0) === 0) danglingSum += rank[i] ?? 0;
      }
      // Dangling nodes distribute to personalization vector
      for (let j = 0; j < n; j++) {
        next[j] = (next[j] ?? 0) + PAGERANK_DAMPING * danglingSum * (pv[j] ?? 0);
      }

      for (const { from, to, weight } of adj) {
        const contribution =
          (PAGERANK_DAMPING * (rank[from] ?? 0) * weight) / (outWeight[from] ?? 1);
        next[to] = (next[to] ?? 0) + contribution;
      }
      [rank, next] = [next, rank];
    }

    const update = this.db.prepare("UPDATE files SET pagerank = ? WHERE id = ?");
    const tx = this.db.transaction(() => {
      for (let i = 0; i < n; i++) {
        update.run(rank[i] ?? 0, ids[i] ?? 0);
      }
    });
    tx();
  }

  private detectGit(): boolean {
    if (this.hasGit !== null) return this.hasGit;
    try {
      execSync("git rev-parse --git-dir", { cwd: this.cwd, stdio: "pipe", timeout: 3000 });
      this.hasGit = true;
    } catch {
      this.hasGit = false;
    }
    return this.hasGit;
  }

  private buildCoChanges(): void {
    if (!this.detectGit()) return;

    this.db.run("DELETE FROM cochanges");

    let logOutput: string;
    try {
      logOutput = execSync(
        `git log --format="---COMMIT---" --name-only -n ${String(GIT_LOG_COMMITS)}`,
        { cwd: this.cwd, stdio: "pipe", timeout: 10_000, maxBuffer: 5_000_000 },
      ).toString();
    } catch {
      return;
    }

    const pathToId = new Map<string, number>();
    for (const row of this.db
      .query<{ id: number; path: string }, []>("SELECT id, path FROM files")
      .all()) {
      pathToId.set(row.path, row.id);
    }

    const pairCounts = new Map<string, number>();
    const commits = logOutput.split("---COMMIT---").filter((s) => s.trim());

    for (const commit of commits) {
      const files = commit
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && pathToId.has(l));

      if (files.length < 2 || files.length > MAX_COCHANGE_FILES_PER_COMMIT) continue;

      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const a = files[i] as string;
          const b = files[j] as string;
          const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    if (pairCounts.size === 0) return;

    const insert = this.db.prepare(
      "INSERT OR REPLACE INTO cochanges (file_id_a, file_id_b, count) VALUES (?, ?, ?)",
    );
    const tx = this.db.transaction(() => {
      for (const [key, count] of pairCounts) {
        if (count < 2) continue;
        const [a, b] = key.split("\0") as [string, string];
        const idA = pathToId.get(a);
        const idB = pathToId.get(b);
        if (idA !== undefined && idB !== undefined) {
          insert.run(idA, idB, count);
        }
      }
    });
    tx();
  }

  private getCoChangePartners(fileIds: Set<number>): Map<number, number> {
    if (fileIds.size === 0) return new Map();

    const partners = new Map<number, number>();
    const arr = [...fileIds];
    const placeholders = arr.map(() => "?").join(",");

    const rows = this.db
      .query<{ partner_id: number; total: number }, number[]>(
        `SELECT file_id_b AS partner_id, SUM(count) AS total FROM cochanges
         WHERE file_id_a IN (${placeholders})
         GROUP BY file_id_b
         UNION ALL
         SELECT file_id_a AS partner_id, SUM(count) AS total FROM cochanges
         WHERE file_id_b IN (${placeholders})
         GROUP BY file_id_a`,
      )
      .all(...arr, ...arr);

    for (const row of rows) {
      if (!fileIds.has(row.partner_id)) {
        partners.set(row.partner_id, (partners.get(row.partner_id) ?? 0) + row.total);
      }
    }
    return partners;
  }

  private getBlastRadius(fileIds: number[]): Map<number, number> {
    if (fileIds.length === 0) return new Map();
    const placeholders = fileIds.map(() => "?").join(",");
    const rows = this.db
      .query<{ target_file_id: number; dependents: number }, number[]>(
        `SELECT target_file_id, COUNT(DISTINCT source_file_id) AS dependents
         FROM edges WHERE target_file_id IN (${placeholders})
         GROUP BY target_file_id`,
      )
      .all(...fileIds);

    const result = new Map<number, number>();
    for (const row of rows) result.set(row.target_file_id, row.dependents);
    return result;
  }

  setSemanticSummaries(enabled: boolean): void {
    this.semanticEnabled = enabled;
  }

  isSemanticEnabled(): boolean {
    return this.semanticEnabled;
  }

  setSummaryGenerator(generator: SummaryGenerator | null): void {
    this.summaryGenerator = generator;
  }

  clearSemanticSummaries(): void {
    this.db.run("DELETE FROM semantic_summaries");
  }

  async generateSemanticSummaries(maxSymbols = 100): Promise<number> {
    if (!this.summaryGenerator || !this.ready) return 0;

    const topSymbols = this.db
      .query<
        {
          sym_id: number;
          name: string;
          kind: string;
          signature: string | null;
          line: number;
          end_line: number;
          file_path: string;
          file_mtime: number;
        },
        [number]
      >(
        `SELECT s.id AS sym_id, s.name, s.kind, s.signature, s.line, s.end_line,
                f.path AS file_path, f.mtime_ms AS file_mtime
         FROM symbols s
         JOIN files f ON f.id = s.file_id
         WHERE s.is_exported = 1
           AND s.kind IN ('function', 'method', 'class', 'interface', 'type')
         ORDER BY f.pagerank DESC, s.line ASC
         LIMIT ?`,
      )
      .all(maxSymbols);

    // Filter to symbols that need (re)generation
    const existing = new Map<number, number>();
    for (const row of this.db
      .query<{ symbol_id: number; file_mtime: number }, []>(
        "SELECT symbol_id, file_mtime FROM semantic_summaries",
      )
      .all()) {
      existing.set(row.symbol_id, row.file_mtime);
    }

    const needed: Array<{
      symId: number;
      name: string;
      kind: string;
      signature: string | null;
      code: string;
      filePath: string;
      fileMtime: number;
    }> = [];

    for (const sym of topSymbols) {
      const cachedMtime = existing.get(sym.sym_id);
      if (cachedMtime === sym.file_mtime) continue;

      const absPath = join(this.cwd, sym.file_path);
      let code = "";
      try {
        const content = require("node:fs").readFileSync(absPath, "utf-8") as string;
        const lines = content.split("\n");
        const startLine = Math.max(0, sym.line - 1);
        // end_line often equals line (name node only) — expand to capture the body
        let endLine = sym.end_line;
        if (endLine <= sym.line) {
          // Scan forward for closing brace/dedent (heuristic: up to 60 lines)
          const limit = Math.min(startLine + 60, lines.length);
          let depth = 0;
          for (let k = startLine; k < limit; k++) {
            const l = lines[k] ?? "";
            for (const ch of l) {
              if (ch === "{" || ch === "(") depth++;
              else if (ch === "}" || ch === ")") depth--;
            }
            if (depth <= 0 && k > startLine) {
              endLine = k + 1;
              break;
            }
          }
          if (endLine <= sym.line) endLine = Math.min(startLine + 15, lines.length);
        }
        endLine = Math.min(lines.length, endLine);
        const snippet = lines.slice(startLine, endLine).join("\n");
        code = snippet.length > 1500 ? `${snippet.slice(0, 1500)}...` : snippet;
      } catch {
        continue;
      }

      needed.push({
        symId: sym.sym_id,
        name: sym.name,
        kind: sym.kind,
        signature: sym.signature,
        code,
        filePath: sym.file_path,
        fileMtime: sym.file_mtime,
      });
    }

    if (needed.length === 0) return 0;

    // Batch generate summaries
    const batch: SymbolForSummary[] = needed.map((s) => ({
      name: s.name,
      kind: s.kind,
      signature: s.signature,
      code: s.code,
      filePath: s.filePath,
    }));

    const results = await this.summaryGenerator(batch);

    const summaryMap = new Map<string, string>();
    for (const r of results) summaryMap.set(r.name, r.summary);

    const upsert = this.db.prepare(
      `INSERT OR REPLACE INTO semantic_summaries (symbol_id, summary, file_mtime)
       VALUES (?, ?, ?)`,
    );
    const symExists = this.db.prepare("SELECT 1 FROM symbols WHERE id = ?");
    let count = 0;
    const tx = this.db.transaction(() => {
      for (const sym of needed) {
        const summary = summaryMap.get(sym.name);
        if (summary && symExists.get(sym.symId)) {
          upsert.run(sym.symId, summary, sym.fileMtime);
          count++;
        }
      }
    });
    tx();
    return count;
  }

  private getSemanticSummaries(symbolIds: number[]): Map<number, string> {
    if (!this.semanticEnabled || symbolIds.length === 0) return new Map();
    const placeholders = symbolIds.map(() => "?").join(",");
    const rows = this.db
      .query<{ symbol_id: number; summary: string }, number[]>(
        `SELECT symbol_id, summary FROM semantic_summaries WHERE symbol_id IN (${placeholders})`,
      )
      .all(...symbolIds);
    const result = new Map<number, string>();
    for (const row of rows) result.set(row.symbol_id, row.summary);
    return result;
  }

  onFileChanged(absPath: string): void {
    const relPath = relative(this.cwd, absPath);
    const ext = extname(absPath).toLowerCase();
    const language = INDEXABLE_EXTENSIONS[ext];
    if (!language) return;

    try {
      const stat = statSync(absPath);
      this.ensureTreeSitter()
        .then(() => this.indexFile(absPath, relPath, stat.mtimeMs, language))
        .catch(() => {});
      this.markDirty();
    } catch {}
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.dirtyTimer) clearTimeout(this.dirtyTimer);
    this.dirtyTimer = setTimeout(() => {
      this.dirtyTimer = null;
    }, DIRTY_DEBOUNCE_MS);
  }

  private flushIfDirty(): void {
    if (!this.dirty || this.dirtyTimer) return;
    this.dirty = false;
    this.buildEdges();
    this.computePageRank();
  }

  render(opts: RepoMapOptions = {}): string {
    this.flushIfDirty();

    // Recompute PageRank with personalization when we have conversation context
    const pv = this.buildPersonalization(opts);
    if (pv.size > 0) this.computePageRank(pv);

    const budget = this.computeBudget(opts.conversationTokens);
    const ranked = this.rankFiles(opts);
    if (ranked.length === 0) return "";

    const candidateIds = ranked.slice(0, 100).map((f) => f.id);
    const placeholders = candidateIds.map(() => "?").join(",");
    const allSymbols = this.db
      .query<SymbolRow, number[]>(
        `SELECT id, file_id, name, kind, line, end_line, is_exported, signature FROM symbols WHERE file_id IN (${placeholders}) AND kind != 'variable' AND kind != 'constant' ORDER BY file_id, line`,
      )
      .all(...candidateIds);

    const symbolsByFile = new Map<number, SymbolRow[]>();
    for (const sym of allSymbols) {
      let arr = symbolsByFile.get(sym.file_id);
      if (!arr) {
        arr = [];
        symbolsByFile.set(sym.file_id, arr);
      }
      arr.push(sym);
    }

    // Blast radius: how many files depend on each candidate
    const blastRadius = this.getBlastRadius(candidateIds);

    // Semantic summaries: load cached summaries for all candidate symbols
    const semanticMap = this.getSemanticSummaries(allSymbols.map((s) => s.id));

    // Diff-aware: track which files are new since last render
    const prevPathSet = new Set(this.prevRenderedPaths);

    // Pre-compute all file blocks for binary search
    const blocks: Array<{ path: string; fileLine: string; symbolLines: string; tokens: number }> =
      [];
    for (const file of ranked) {
      const radius = blastRadius.get(file.id);
      const radiusTag = radius && radius >= 2 ? ` (→${String(radius)})` : "";
      const newTag = prevPathSet.size > 0 && !prevPathSet.has(file.path) ? " [NEW]" : "";
      const fileLine = `${file.path}:${radiusTag}${newTag}`;
      const symbols = symbolsByFile.get(file.id) ?? [];
      let symbolLines = "";
      for (const sym of symbols) {
        const exported = sym.is_exported ? "+" : " ";
        const semantic = semanticMap.get(sym.id);
        const display = semantic
          ? `${sym.name} — ${semantic}`
          : (sym.signature ?? `${kindTag(sym.kind as SymbolKind)}${sym.name}`);
        symbolLines += `  ${exported}${display}\n`;
      }
      const blockTokens = estimateTokens(fileLine) + estimateTokens(symbolLines);
      blocks.push({ path: file.path, fileLine, symbolLines, tokens: blockTokens });
    }

    // Binary search: find the max number of blocks that fit within budget
    let lo = 1;
    let hi = Math.min(blocks.length, Math.ceil(budget / 5));
    let bestCount = 1;
    let bestTokens = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      let total = 0;
      for (let i = 0; i < mid; i++) total += blocks[i]?.tokens ?? 0;
      if (total <= budget) {
        bestCount = mid;
        bestTokens = total;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    // Try to squeeze in one more block if we have remaining budget
    if (bestCount < blocks.length) {
      const nextBlock = blocks[bestCount];
      if (nextBlock && bestTokens + nextBlock.tokens <= budget * 1.05) {
        bestCount++;
      }
    }

    const lines: string[] = [];
    const currentPaths: string[] = [];
    for (let i = 0; i < bestCount; i++) {
      const block = blocks[i];
      if (!block) break;
      lines.push(block.fileLine);
      if (block.symbolLines) lines.push(block.symbolLines.trimEnd());
      currentPaths.push(block.path);
    }

    this.prevRenderedPaths = currentPaths;
    return lines.join("\n");
  }

  private buildPersonalization(opts: RepoMapOptions): Map<number, number> {
    const pv = new Map<number, number>();
    const mentionedSet = new Set((opts.mentionedFiles ?? []).map((f) => relative(this.cwd, f)));
    const editedSet = new Set((opts.editedFiles ?? []).map((f) => relative(this.cwd, f)));
    const editorRel = opts.editorFile ? relative(this.cwd, opts.editorFile) : null;

    if (mentionedSet.size === 0 && editedSet.size === 0 && !editorRel) return pv;

    const allFiles = this.db
      .query<{ id: number; path: string }, []>("SELECT id, path FROM files")
      .all();

    const contextFileIds = new Set<number>();
    const base = 100 / Math.max(allFiles.length, 1);
    for (const f of allFiles) {
      let boost = base;
      if (editedSet.has(f.path)) {
        boost += base * 5;
        contextFileIds.add(f.id);
      }
      if (mentionedSet.has(f.path)) {
        boost += base * 3;
        contextFileIds.add(f.id);
      }
      if (f.path === editorRel) {
        boost += base * 2;
        contextFileIds.add(f.id);
      }
      if (boost > base) pv.set(f.id, boost);
    }

    // Co-change partners get a lighter boost in personalization
    const coPartners = this.getCoChangePartners(contextFileIds);
    for (const [fileId, count] of coPartners) {
      if (!pv.has(fileId)) {
        pv.set(fileId, base + base * Math.min(count / 3, 2));
      }
    }

    return pv;
  }

  private computeBudget(conversationTokens?: number): number {
    if (!conversationTokens || conversationTokens < 1000) return DEFAULT_TOKEN_BUDGET;
    const scale = Math.max(0, 1 - conversationTokens / 100_000);
    return Math.round(MIN_TOKEN_BUDGET + (MAX_TOKEN_BUDGET - MIN_TOKEN_BUDGET) * scale);
  }

  private rankFiles(opts: RepoMapOptions): FileRow[] {
    const allFiles = this.db
      .query<FileRow, []>(
        "SELECT id, path, mtime_ms, language, line_count, symbol_count, pagerank FROM files ORDER BY pagerank DESC",
      )
      .all();

    // FTS matching on conversation terms (not captured by PageRank personalization)
    let ftsMatches = new Set<number>();
    if (opts.conversationTerms && opts.conversationTerms.length > 0) {
      const ftsQuery = opts.conversationTerms
        .slice(0, 10)
        .map((t) => `"${t.replace(/"/g, "")}"`)
        .join(" OR ");
      try {
        const rows = this.db
          .query<{ id: number }, [string]>(
            `SELECT DISTINCT s.file_id AS id FROM symbols_fts f
             JOIN symbols s ON s.id = f.rowid
             WHERE symbols_fts MATCH ?`,
          )
          .all(ftsQuery);
        ftsMatches = new Set(rows.map((r) => r.id));
      } catch {}
    }

    // Neighbor boosting (files connected to context files via edges)
    const mentionedSet = new Set((opts.mentionedFiles ?? []).map((f) => relative(this.cwd, f)));
    const editedSet = new Set((opts.editedFiles ?? []).map((f) => relative(this.cwd, f)));
    const editorRel = opts.editorFile ? relative(this.cwd, opts.editorFile) : null;

    const neighborFiles = new Set<number>();
    const boostFileIds = new Set<number>();
    for (const f of allFiles) {
      if (mentionedSet.has(f.path) || editedSet.has(f.path) || f.path === editorRel) {
        boostFileIds.add(f.id);
      }
    }
    if (boostFileIds.size > 0) {
      const boostArr = [...boostFileIds];
      const placeholders = boostArr.map(() => "?").join(",");
      const params = [...boostArr, ...boostArr];
      const neighbors = this.db
        .query<{ target_file_id: number }, number[]>(
          `SELECT DISTINCT target_file_id FROM edges WHERE source_file_id IN (${placeholders})
           UNION
           SELECT DISTINCT source_file_id FROM edges WHERE target_file_id IN (${placeholders})`,
        )
        .all(...params);
      for (const row of neighbors) neighborFiles.add(row.target_file_id);
    }

    // Co-change partners: files that historically change together with context files
    const coChangePartners = this.getCoChangePartners(boostFileIds);

    // PageRank already incorporates mentioned/edited/editor boosts via personalization.
    // Post-hoc: add FTS, neighbor, and co-change signals that PageRank can't capture.
    const scored = allFiles.map((f) => {
      let score = f.pagerank * 1000;
      if (ftsMatches.has(f.id)) score += 0.5;
      if (neighborFiles.has(f.id)) score += 1;
      const cochangeCount = coChangePartners.get(f.id);
      if (cochangeCount) score += Math.min(cochangeCount / 5, 3);
      return { ...f, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /** Find a symbol by exact name across all indexed files. Returns the absolute file path or null. */
  findSymbol(name: string): string | null {
    const row = this.db
      .query<{ path: string }, [string]>(
        `SELECT f.path FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE s.name = ? AND s.kind IN ('interface','type','class','function','enum')
         ORDER BY s.is_exported DESC, f.pagerank DESC LIMIT 1`,
      )
      .get(name);
    if (!row) return null;
    return join(this.cwd, row.path);
  }

  getStats(): { files: number; symbols: number; edges: number; summaries: number } {
    const files = this.db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM files").get()?.c ?? 0;
    const symbols =
      this.db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM symbols").get()?.c ?? 0;
    const edges = this.db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM edges").get()?.c ?? 0;
    const summaries =
      this.db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM semantic_summaries").get()?.c ??
      0;
    return { files, symbols, edges, summaries };
  }

  clear(): void {
    this.db.run("DROP TRIGGER IF EXISTS symbols_ai");
    this.db.run("DROP TRIGGER IF EXISTS symbols_ad");
    this.db.run("DELETE FROM semantic_summaries");
    this.db.run("DELETE FROM cochanges");
    this.db.run("DELETE FROM edges");
    this.db.run("DELETE FROM refs");
    this.db.run("DELETE FROM symbols");
    this.db.run("DELETE FROM files");
    this.rebuildFts();
    this.ready = false;
    this.scanPromise = null;
    this.prevRenderedPaths = [];
  }

  private rebuildFts(): void {
    this.db.run("DROP TRIGGER IF EXISTS symbols_ai");
    this.db.run("DROP TRIGGER IF EXISTS symbols_ad");
    this.db.run("DROP TABLE IF EXISTS symbols_fts");
    this.db.run(`
      CREATE VIRTUAL TABLE symbols_fts USING fts5(name, kind);
      CREATE TRIGGER symbols_ai AFTER INSERT ON symbols BEGIN
        INSERT INTO symbols_fts(rowid, name, kind) VALUES (new.id, new.name, new.kind);
      END;
      CREATE TRIGGER symbols_ad AFTER DELETE ON symbols BEGIN
        DELETE FROM symbols_fts WHERE rowid = old.id;
      END;
    `);
    this.db.run("INSERT INTO symbols_fts(rowid, name, kind) SELECT id, name, kind FROM symbols");
  }

  dbSizeBytes(): number {
    try {
      const row = this.db
        .query<{ s: number }, []>(
          "SELECT page_count * page_size AS s FROM pragma_page_count(), pragma_page_size()",
        )
        .get();
      return row?.s ?? 0;
    } catch {
      return 0;
    }
  }

  close(): void {
    this.db.close();
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function extractSignature(lines: string[], lineIdx: number, kind: string): string | null {
  const line = lines[lineIdx];
  if (!line) return null;

  let sig = line.trimStart();

  // For functions/methods, capture up to the opening brace or end of params
  if (kind === "function" || kind === "method") {
    // If the signature spans multiple lines (params not closed), grab up to 2 more
    if (!sig.includes(")") && !sig.includes("{") && !sig.includes("=>")) {
      for (let i = 1; i <= 2; i++) {
        const next = lines[lineIdx + i];
        if (!next) break;
        sig += ` ${next.trim()}`;
        if (next.includes(")") || next.includes("{")) break;
      }
    }
  }

  // Strip body: remove everything after opening brace
  const braceIdx = sig.indexOf("{");
  if (braceIdx > 0) sig = sig.slice(0, braceIdx).trimEnd();

  // Strip trailing body markers
  sig = sig.replace(/\s*[{:]\s*$/, "").trimEnd();

  // Cap length for token budget
  if (sig.length > 120) sig = `${sig.slice(0, 117)}...`;

  return sig || null;
}

function kindTag(kind: SymbolKind): string {
  switch (kind) {
    case "function":
    case "method":
      return "f:";
    case "class":
      return "c:";
    case "interface":
      return "i:";
    case "type":
      return "t:";
    case "variable":
    case "constant":
      return "v:";
    case "enum":
      return "e:";
    default:
      return "";
  }
}

interface CollectedFile {
  path: string;
  mtimeMs: number;
}

function collectFiles(dir: string, depth = 0): CollectedFile[] {
  if (depth > MAX_DEPTH) return [];
  const files: CollectedFile[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          files.push(...collectFiles(fullPath, depth + 1));
        }
      } else if (entry.isFile()) {
        if (isForbidden(fullPath)) continue;
        const ext = extname(entry.name).toLowerCase();
        if (ext in INDEXABLE_EXTENSIONS) {
          try {
            const stat = statSync(fullPath);
            if (stat.size < MAX_FILE_SIZE) files.push({ path: fullPath, mtimeMs: stat.mtimeMs });
          } catch {}
        }
      }
    }
  } catch {}
  return files;
}
