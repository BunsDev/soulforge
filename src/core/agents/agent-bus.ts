/**
 * AgentBus — Shared coordination layer for parallel subagents.
 *
 * Each bus instance lives for the duration of a single `multi_agent` dispatch.
 * Subagents post findings to the bus, and can query findings from peers.
 * The bus is immutable-append-only (no deletions) to avoid race conditions.
 */

export function normalizePath(p: string): string {
  let n = p;
  while (n.startsWith("./")) n = n.slice(2);
  return n.replace(/\/+/g, "/");
}

export interface SharedCache {
  files: Map<string, string | null>;
  toolResults: Map<string, string>;
  findings: BusFinding[];
}

export interface BusFinding {
  /** Which agent posted this */
  agentId: string;
  /** Short label for the finding */
  label: string;
  /** Full content — code snippets, analysis, file paths, etc. */
  content: string;
  /** Timestamp */
  timestamp: number;
}

export interface AgentTask {
  /** Unique ID for this agent within the dispatch group */
  agentId: string;
  /** "explore" or "code" */
  role: "explore" | "code";
  /** The task description sent to the subagent */
  task: string;
  /** Optional dependencies — agent IDs that must complete first */
  dependsOn?: string[];
  /** Optional timeout in ms for dependency waits (default: 300_000) */
  timeoutMs?: number;
}

export interface AgentResult {
  agentId: string;
  role: "explore" | "code";
  task: string;
  result: string;
  success: boolean;
  error?: string;
}

interface FileCacheEntry {
  agentId: string;
  state: "reading" | "done" | "failed";
  content: string | null;
  waiters: Array<(content: string | null) => void>;
  /** Incremented on every edit/update — reads check this to avoid overwriting fresher content */
  gen: number;
}

export type AcquireResult =
  | { cached: true; content: string | null }
  | { cached: false; gen: number }
  | { cached: "waiting"; content: Promise<string | null> };

export type CacheEventType = "hit" | "wait" | "store" | "invalidate";
export type CacheEventCallback = (
  agentId: string,
  type: CacheEventType,
  path: string,
  sourceAgentId: string,
) => void;

export type ToolCacheEventCallback = (
  agentId: string,
  toolName: string,
  key: string,
  type: "hit" | "store",
) => void;

export interface CacheMetrics {
  fileHits: number;
  fileMisses: number;
  fileWaits: number;
  toolHits: number;
  toolMisses: number;
  toolEvictions: number;
  toolInvalidations: number;
}

export interface FileReadRecord {
  agentId: string;
  path: string;
  tool: string;
  target?: string;
  name?: string;
  startLine?: number;
  endLine?: number;
  cached: boolean;
}

export class AgentBus {
  private findings: BusFinding[] = [];
  private findingKeys = new Set<string>();
  private results = new Map<string, AgentResult>();
  private completionCallbacks = new Map<string, Array<() => void>>();

  tasks: AgentTask[] = [];
  onCacheEvent: CacheEventCallback | null = null;
  onToolCacheEvent: ToolCacheEventCallback | null = null;
  private fileCache = new Map<string, FileCacheEntry>();
  private _filesRead = new Map<string, Set<string>>();
  private _fileReadRecords: FileReadRecord[] = [];
  private _filesEdited = new Map<string, Set<string>>();
  private toolResultCache = new Map<string, string>();
  private readonly toolResultCacheMaxSize = 200;
  private _lastSeenFindingIdx = new Map<string, number>();
  private _editLocks = new Map<string, Promise<void>>();
  private _fileOwners = new Map<string, string>();
  private _metrics: CacheMetrics = {
    fileHits: 0,
    fileMisses: 0,
    fileWaits: 0,
    toolHits: 0,
    toolMisses: 0,
    toolEvictions: 0,
    toolInvalidations: 0,
  };

  private _abortController = new AbortController();

  constructor(shared?: SharedCache) {
    if (shared) {
      for (const [path, content] of shared.files) {
        this.fileCache.set(path, {
          agentId: "_shared",
          state: "done",
          content,
          waiters: [],
          gen: 0,
        });
      }
      for (const [key, result] of shared.toolResults) {
        this.toolResultCache.set(key, result);
      }
      for (const finding of shared.findings) {
        this.postFinding(finding);
      }
    }
  }

  get abortSignal(): AbortSignal {
    return this._abortController.signal;
  }

  abort(reason?: string): void {
    this._abortController.abort(reason ?? "dispatch cancelled by peer agent");
  }

  registerTasks(tasks: AgentTask[]): void {
    this.tasks = tasks;
  }

  getPeerObjectives(excludeAgentId: string): string {
    const peers = this.tasks.filter((t) => t.agentId !== excludeAgentId);
    if (peers.length === 0) return "";
    return peers.map((t) => `[${t.agentId}] (${t.role}): ${t.task}`).join("\n");
  }

  acquireFileRead(agentId: string, path: string): AcquireResult {
    const key = normalizePath(path);
    const entry = this.fileCache.get(key);
    if (entry) {
      if (entry.state === "done") {
        this._metrics.fileHits++;
        this.onCacheEvent?.(agentId, "hit", key, entry.agentId);
        return { cached: true, content: entry.content };
      }
      if (entry.state === "reading") {
        this._metrics.fileWaits++;
        this.onCacheEvent?.(agentId, "wait", key, entry.agentId);
        const promise = new Promise<string | null>((resolve) => {
          entry.waiters.push(resolve);
        });
        return { cached: "waiting", content: promise };
      }
    }
    this._metrics.fileMisses++;
    const gen = entry?.gen ?? 0;
    this.fileCache.set(key, { agentId, state: "reading", content: null, waiters: [], gen });
    return { cached: false, gen };
  }

  releaseFileRead(path: string, content: string | null, readGen: number): void {
    const key = normalizePath(path);
    const entry = this.fileCache.get(key);
    if (!entry) return;
    if (entry.gen !== readGen) return;
    entry.state = "done";
    entry.content = content;
    for (const waiter of entry.waiters) waiter(content);
    entry.waiters = [];
  }

  failFileRead(path: string, readGen: number): void {
    const key = normalizePath(path);
    const entry = this.fileCache.get(key);
    if (!entry) return;
    if (entry.gen !== readGen) return;
    const { waiters } = entry;
    this.fileCache.delete(key);
    for (const waiter of waiters) waiter(null);
  }

  invalidateFile(path: string, agentId = "_edit"): void {
    const key = normalizePath(path);
    const entry = this.fileCache.get(key);
    if (entry && entry.waiters.length > 0) {
      for (const waiter of entry.waiters) waiter(null);
      entry.waiters = [];
    }
    this.fileCache.delete(key);
    const invalidated = this.invalidateToolResultsForFile(key);
    if (invalidated > 0) {
      this.onCacheEvent?.(agentId, "invalidate", key, agentId);
    }
  }

  updateFile(path: string, content: string, agentId = "_edit"): void {
    const key = normalizePath(path);
    const entry = this.fileCache.get(key);
    if (entry) {
      entry.gen++;
      entry.content = content;
      entry.state = "done";
      entry.agentId = agentId;
      for (const waiter of entry.waiters) waiter(content);
      entry.waiters = [];
    } else {
      this.fileCache.set(key, { agentId, state: "done", content, waiters: [], gen: 1 });
    }
    const invalidated = this.invalidateToolResultsForFile(key);
    if (invalidated > 0) {
      this.onCacheEvent?.(agentId, "invalidate", key, agentId);
    }
  }

  private invalidateToolResultsForFile(filePath: string): number {
    let count = 0;
    for (const k of this.toolResultCache.keys()) {
      if (k.includes(filePath)) {
        this.toolResultCache.delete(k);
        this._metrics.toolInvalidations++;
        count++;
        continue;
      }
      try {
        const parts = JSON.parse(k) as string[];
        const tool = parts[0];
        if ((tool === "grep" || tool === "glob") && parts.some((p) => p === "." || p === "")) {
          this.toolResultCache.delete(k);
          this._metrics.toolInvalidations++;
          count++;
        }
      } catch {
        if ((k.startsWith("grep:") || k.startsWith("glob:")) && k.includes(":.")) {
          this.toolResultCache.delete(k);
          this._metrics.toolInvalidations++;
          count++;
        }
      }
    }
    return count;
  }

  recordFileRead(
    agentId: string,
    path: string,
    detail?: {
      tool?: string;
      target?: string;
      name?: string;
      startLine?: number;
      endLine?: number;
      cached?: boolean;
    },
  ): void {
    let set = this._filesRead.get(agentId);
    if (!set) {
      set = new Set();
      this._filesRead.set(agentId, set);
    }
    set.add(path);

    this._fileReadRecords.push({
      agentId,
      path,
      tool: detail?.tool ?? "read_file",
      target: detail?.target,
      name: detail?.name,
      startLine: detail?.startLine,
      endLine: detail?.endLine,
      cached: detail?.cached ?? false,
    });
  }

  getFilesRead(peerId?: string): Map<string, string[]> {
    const result = new Map<string, string[]>();
    if (peerId) {
      const set = this._filesRead.get(peerId);
      if (set) result.set(peerId, [...set]);
    } else {
      for (const [id, set] of this._filesRead) {
        result.set(id, [...set]);
      }
    }
    return result;
  }

  getFileReadRecords(agentId?: string): FileReadRecord[] {
    if (agentId) return this._fileReadRecords.filter((r) => r.agentId === agentId);
    return [...this._fileReadRecords];
  }

  recordFileEdit(agentId: string, path: string): void {
    let editors = this._filesEdited.get(path);
    if (!editors) {
      editors = new Set();
      this._filesEdited.set(path, editors);
    }
    editors.add(agentId);
  }

  checkEditConflict(agentId: string, path: string): string | null {
    const editors = this._filesEdited.get(path);
    if (!editors) return null;
    for (const editor of editors) {
      if (editor !== agentId) return editor;
    }
    return null;
  }

  acquireEditLock(
    agentId: string,
    path: string,
  ): Promise<{ release: () => void; owner: string | null }> {
    const prev = this._editLocks.get(path) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>((r) => {
      release = r;
    });
    this._editLocks.set(
      path,
      prev.then(() => done),
    );
    const existingOwner = this._fileOwners.get(path) ?? null;
    return prev.then(() => {
      if (!this._fileOwners.has(path)) {
        this._fileOwners.set(path, agentId);
      }
      return { release, owner: existingOwner };
    });
  }

  getFileOwner(path: string): string | null {
    return this._fileOwners.get(path) ?? null;
  }

  claimFile(agentId: string, path: string): boolean {
    const normalized = normalizePath(path);
    const owner = this._fileOwners.get(normalized);
    if (owner && owner !== agentId) return false;
    this._fileOwners.set(normalized, agentId);
    return true;
  }

  getEditedFiles(agentId?: string): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [path, editors] of this._filesEdited) {
      if (agentId) {
        if (editors.has(agentId)) result.set(path, [...editors]);
      } else {
        result.set(path, [...editors]);
      }
    }
    return result;
  }

  acquireToolResult(agentId: string, key: string): string | null {
    const result = this.toolResultCache.get(key);
    if (result === undefined) {
      this._metrics.toolMisses++;
      return null;
    }
    this._metrics.toolHits++;
    this.toolResultCache.delete(key);
    this.toolResultCache.set(key, result);
    let toolName = key;
    try {
      const parts = JSON.parse(key) as string[];
      toolName = parts[0] ?? key;
    } catch {
      const colonIdx = key.indexOf(":");
      toolName = colonIdx >= 0 ? key.slice(0, colonIdx) : key;
    }
    this.onToolCacheEvent?.(agentId, toolName, key, "hit");
    return result;
  }

  cacheToolResult(agentId: string, key: string, result: string): void {
    this.toolResultCache.delete(key);
    if (this.toolResultCache.size >= this.toolResultCacheMaxSize) {
      this._metrics.toolEvictions++;
      const firstKey = this.toolResultCache.keys().next().value;
      if (firstKey) this.toolResultCache.delete(firstKey);
    }
    this.toolResultCache.set(key, result);
    let toolName = key;
    try {
      const parts = JSON.parse(key) as string[];
      toolName = parts[0] ?? key;
    } catch {
      const colonIdx = key.indexOf(":");
      toolName = colonIdx >= 0 ? key.slice(0, colonIdx) : key;
    }
    this.onToolCacheEvent?.(agentId, toolName, key, "store");
  }

  postFinding(finding: BusFinding): void {
    if (this.findings.length >= 30) return;
    const key = `${finding.agentId}:${finding.label}`;
    if (this.findingKeys.has(key)) return;
    this.findingKeys.add(key);
    this.findings.push(finding);
  }

  getFindings(excludeAgentId?: string): BusFinding[] {
    if (!excludeAgentId) return [...this.findings];
    return this.findings.filter((f) => f.agentId !== excludeAgentId);
  }

  getPeerFindings(peerId: string): BusFinding[] {
    return this.findings.filter((f) => f.agentId === peerId);
  }

  setResult(result: AgentResult): void {
    this.results.set(result.agentId, result);
    const cbs = this.completionCallbacks.get(result.agentId);
    if (cbs) {
      for (const cb of cbs) cb();
      this.completionCallbacks.delete(result.agentId);
    }
  }

  getResult(agentId: string): AgentResult | undefined {
    return this.results.get(agentId);
  }

  getAllResults(): AgentResult[] {
    return [...this.results.values()];
  }

  waitForAgent(agentId: string, timeoutMs = 300_000): Promise<AgentResult> {
    const existing = this.results.get(agentId);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new Error(`Timed out waiting for agent "${agentId}" (${String(timeoutMs / 1000)}s)`),
        );
      }, timeoutMs);
      const cbs = this.completionCallbacks.get(agentId) ?? [];
      cbs.push(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const result = this.results.get(agentId);
        if (result) resolve(result);
      });
      this.completionCallbacks.set(agentId, cbs);
    });
  }

  summarizeFindings(excludeAgentId?: string): string {
    const findings = this.getFindings(excludeAgentId);
    if (findings.length === 0) return "No findings from peer agents yet.";
    return findings.map((f) => `[${f.agentId}] ${f.label}:\n${f.content}`).join("\n\n---\n\n");
  }

  drainUnseenFindings(agentId: string): string | null {
    const lastSeen = this._lastSeenFindingIdx.get(agentId) ?? 0;
    this._lastSeenFindingIdx.set(agentId, this.findings.length);
    if (lastSeen >= this.findings.length) return null;
    const parts: string[] = [];
    for (let i = lastSeen; i < this.findings.length; i++) {
      const f = this.findings[i];
      if (f && f.agentId !== agentId) {
        parts.push(`[${f.agentId}] ${f.label}: ${f.content}`);
      }
    }
    return parts.length > 0 ? parts.join("\n") : null;
  }

  get completedAgentIds(): string[] {
    return [...this.results.keys()];
  }

  get findingCount(): number {
    return this.findings.length;
  }

  getFileContent(path: string): string | null {
    const entry = this.fileCache.get(normalizePath(path));
    if (entry?.state === "done") return entry.content;
    return null;
  }

  getToolResultSummary(): string[] {
    const summaries: string[] = [];
    for (const [key] of this.toolResultCache) {
      try {
        const parts = JSON.parse(key) as string[];
        const [tool, ...rest] = parts;
        switch (tool) {
          case "read_code":
            summaries.push(`read_code ${rest.join(" ")}`);
            break;
          case "navigate":
            summaries.push(`navigate ${rest.join(" ")}`);
            break;
          case "analyze":
            summaries.push(`analyze ${rest.join(" ")}`);
            break;
          case "grep":
            summaries.push(`grep ${rest[0] ?? ""}`);
            break;
          case "glob":
            summaries.push(`glob ${rest[0] ?? ""}`);
            break;
          case "web_search":
            summaries.push(`web_search "${rest[0] ?? ""}"`);
            break;
        }
      } catch {
        summaries.push(key);
      }
    }
    return summaries;
  }

  get metrics(): Readonly<CacheMetrics> {
    return this._metrics;
  }

  exportCaches(): SharedCache {
    const files = new Map<string, string | null>();
    for (const [path, entry] of this.fileCache) {
      if (entry.state === "done") files.set(path, entry.content);
    }
    return {
      files,
      toolResults: new Map(this.toolResultCache),
      findings: [...this.findings],
    };
  }
}
