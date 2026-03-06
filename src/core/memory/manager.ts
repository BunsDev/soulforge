import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MemoryDB } from "./db.js";
import { migrateOldMemory } from "./migrate.js";
import type {
  MemoryCategory,
  MemoryRecord,
  MemoryScope,
  MemoryScopeConfig,
  MemorySummary,
} from "./types.js";

export type SettingsScope = "session" | "project" | "global";

const CONFIG_FILE = "memory-config.json";
const DEFAULT_CONFIG: MemoryScopeConfig = { writeScope: "global", readScope: "all" };

export class MemoryManager {
  private globalDb: MemoryDB;
  private projectDb: MemoryDB;
  private sessionDb: MemoryDB;
  private cwd: string;
  private _scopeConfig: MemoryScopeConfig = { ...DEFAULT_CONFIG };
  private _settingsScope: SettingsScope = "session";

  get scopeConfig(): MemoryScopeConfig {
    return this._scopeConfig;
  }

  set scopeConfig(config: MemoryScopeConfig) {
    this._scopeConfig = config;
    if (this._settingsScope !== "session") {
      this.saveConfig(this._settingsScope);
    }
  }

  get settingsScope(): SettingsScope {
    return this._settingsScope;
  }

  constructor(cwd: string) {
    this.cwd = cwd;

    const globalPath = join(homedir(), ".soulforge", "memory.db");
    const projectPath = join(cwd, ".soulforge", "memory.db");

    this.globalDb = new MemoryDB(globalPath, "global");
    this.projectDb = new MemoryDB(projectPath, "project");
    this.sessionDb = new MemoryDB(":memory:", "session");

    this.loadConfig();
    this.tryMigrate();
  }

  private configPath(scope: "project" | "global"): string {
    return scope === "global"
      ? join(homedir(), ".soulforge", CONFIG_FILE)
      : join(this.cwd, ".soulforge", CONFIG_FILE);
  }

  private loadConfig(): void {
    for (const scope of ["project", "global"] as const) {
      const path = this.configPath(scope);
      if (!existsSync(path)) continue;
      try {
        const data = JSON.parse(readFileSync(path, "utf-8")) as MemoryScopeConfig;
        if (data.writeScope && data.readScope) {
          this._scopeConfig = data;
          this._settingsScope = scope;
          return;
        }
      } catch {
        // ignore corrupt config
      }
    }
  }

  saveConfig(to: "project" | "global"): void {
    const path = this.configPath(to);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(this._scopeConfig, null, 2), "utf-8");
    this._settingsScope = to;
  }

  deleteConfig(from: "project" | "global"): void {
    const path = this.configPath(from);
    if (existsSync(path)) rmSync(path);
    if (from === this._settingsScope) {
      this._settingsScope = "session";
    }
  }

  setSettingsScope(scope: SettingsScope): void {
    if (scope === "session") {
      if (this._settingsScope !== "session") {
        this.deleteConfig(this._settingsScope as "project" | "global");
      }
      this._settingsScope = "session";
    } else {
      if (this._settingsScope !== "session" && this._settingsScope !== scope) {
        this.deleteConfig(this._settingsScope as "project" | "global");
      }
      this.saveConfig(scope);
    }
  }

  private tryMigrate(): void {
    const oldDir = join(this.cwd, ".soulforge", "memory");
    if (!existsSync(oldDir)) return;

    const hasData = this.projectDb.list().length > 0;
    if (hasData) return;

    migrateOldMemory(oldDir, this.projectDb);
  }

  private getDb(scope: MemoryScope): MemoryDB {
    if (scope === "session") return this.sessionDb;
    return scope === "global" ? this.globalDb : this.projectDb;
  }

  private getReadDbs(scope: MemoryScope | "both" | "all" | "none"): MemoryDB[] {
    if (scope === "none") return [];
    if (scope === "session") return [this.sessionDb];
    if (scope === "project") return [this.projectDb];
    if (scope === "global") return [this.globalDb];
    return [this.sessionDb, this.projectDb, this.globalDb];
  }

  write(
    scope: MemoryScope,
    record: Omit<MemoryRecord, "id" | "created_at" | "updated_at"> & { id?: string },
  ): MemoryRecord {
    return this.getDb(scope).write(record);
  }

  read(scope: MemoryScope, id: string): MemoryRecord | null {
    return this.getDb(scope).read(id);
  }

  list(
    scope: MemoryScope | "both" | "all",
    opts?: { category?: MemoryCategory; tag?: string },
  ): (MemorySummary & { scope: MemoryScope })[] {
    const results: (MemorySummary & { scope: MemoryScope })[] = [];
    for (const db of this.getReadDbs(scope)) {
      for (const m of db.list(opts)) {
        results.push({ ...m, scope: db.scope });
      }
    }
    return results;
  }

  search(
    query: string,
    scope: MemoryScope | "both" | "all",
    limit?: number,
  ): (MemorySummary & { scope: MemoryScope })[] {
    const results: (MemorySummary & { scope: MemoryScope })[] = [];
    for (const db of this.getReadDbs(scope)) {
      for (const m of db.search(query, limit)) {
        results.push({ ...m, scope: db.scope });
      }
    }
    return results;
  }

  delete(scope: MemoryScope, id: string): boolean {
    return this.getDb(scope).delete(id);
  }

  clearScope(scope: MemoryScope | "all"): number {
    let cleared = 0;
    const dbs =
      scope === "all" ? [this.sessionDb, this.projectDb, this.globalDb] : [this.getDb(scope)];
    for (const db of dbs) {
      const items = db.list();
      for (const item of items) {
        if (db.delete(item.id)) cleared++;
      }
    }
    return cleared;
  }

  listByScope(scope: MemoryScope): (MemorySummary & { scope: MemoryScope })[] {
    const db = this.getDb(scope);
    return db.list().map((m) => ({ ...m, scope }));
  }

  buildMemoryIndex(): string | null {
    const sessionIdx = this.sessionDb.getIndex();
    const projectIdx = this.projectDb.getIndex();
    const globalIdx = this.globalDb.getIndex();

    if (sessionIdx.total === 0 && projectIdx.total === 0 && globalIdx.total === 0) return null;

    const parts = [
      "You have persistent memory. Use memory_search/memory_read to fetch details on demand.",
      `Write scope: ${this._scopeConfig.writeScope} | Read scope: ${this._scopeConfig.readScope}`,
      "",
    ];

    const addIndex = (label: string, idx: typeof projectIdx) => {
      if (idx.total === 0) return;
      const cats = Object.entries(idx.byCategory)
        .map(([k, v]) => `${k}(${String(v)})`)
        .join(" ");
      parts.push(`${label} (${String(idx.total)}): ${cats}`);
      if (idx.recent.length > 0) {
        parts.push(`Recent: ${idx.recent.map((t) => `"${t}"`).join(", ")}`);
      }
    };

    addIndex("Session", sessionIdx);
    addIndex("Project", projectIdx);
    addIndex("Global", globalIdx);

    return parts.join("\n");
  }

  exportSessionMemories(): MemoryRecord[] {
    const summaries = this.sessionDb.list();
    const records: MemoryRecord[] = [];
    for (const s of summaries) {
      const full = this.sessionDb.read(s.id);
      if (full) records.push(full);
    }
    return records;
  }

  importSessionMemories(records: MemoryRecord[]): void {
    for (const r of records) {
      this.sessionDb.write({
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        tags: r.tags,
      });
    }
  }

  exportSessionState(): { config: MemoryScopeConfig; memories: MemoryRecord[] } {
    return {
      config: this._scopeConfig,
      memories: this.exportSessionMemories(),
    };
  }

  importSessionState(state: { config: MemoryScopeConfig; memories: MemoryRecord[] }): void {
    this._scopeConfig = state.config;
    this.clearScope("session");
    this.importSessionMemories(state.memories);
  }

  close(): void {
    this.sessionDb.close();
    this.globalDb.close();
    this.projectDb.close();
  }
}
