import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatMessage, Session } from "../../types/index.js";

/** Lightweight metadata returned by listSessions (no heavy message arrays). */
export interface SessionMeta {
  id: string;
  title: string;
  messageCount: number;
  startedAt: number;
  updatedAt: number;
}

export class SessionManager {
  private dir: string;

  constructor(cwd: string) {
    this.dir = join(cwd, ".soulforge", "sessions");
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  /** List all sessions, newest first. Only reads metadata, not full messages. */
  listSessions(): SessionMeta[] {
    if (!existsSync(this.dir)) return [];
    try {
      const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      const metas: SessionMeta[] = [];
      for (const file of files) {
        try {
          const raw = readFileSync(join(this.dir, file), "utf-8");
          const session = JSON.parse(raw) as Session;
          metas.push({
            id: session.id,
            title: session.title,
            messageCount: session.messages.length,
            startedAt: session.startedAt,
            updatedAt: session.updatedAt,
          });
        } catch {
          // Skip corrupted files
        }
      }
      return metas.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  /** Load a full session by id. Backfills missing message IDs for old sessions. */
  loadSession(id: string): Session | null {
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;
    try {
      const session = JSON.parse(readFileSync(path, "utf-8")) as Session;
      // Backfill missing IDs for sessions saved before the id field was added
      for (const msg of session.messages) {
        if (!msg.id) {
          msg.id = crypto.randomUUID();
        }
      }
      return session;
    } catch {
      return null;
    }
  }

  /** Save or update a session. */
  saveSession(session: Session): void {
    this.ensureDir();
    const path = join(this.dir, `${session.id}.json`);
    writeFileSync(path, JSON.stringify(session), "utf-8");
  }

  /** Delete a single session. */
  deleteSession(id: string): boolean {
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return false;
    rmSync(path);
    return true;
  }

  /** Delete all sessions. Returns count deleted. */
  clearAllSessions(): number {
    if (!existsSync(this.dir)) return 0;
    const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      rmSync(join(this.dir, file));
    }
    return files.length;
  }

  /** Derive a short title from the first user message. */
  static deriveTitle(messages: ChatMessage[]): string {
    const first = messages.find((m) => m.role === "user");
    if (!first) return "Empty session";
    const text = first.content.trim();
    if (text.length <= 60) return text;
    return `${text.slice(0, 57)}...`;
  }
}
