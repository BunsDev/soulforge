import type { Session, Result } from "./types.js";
import { getUser, getUserByEmail } from "./db.js";

const sessions = new Map<string, Session>();

export function hashPassword(pw: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(pw);
  return hasher.digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function login(email: string, password: string): Result<Session> {
  if (!email || !password) return { ok: false, error: "email and password required" };
  const user = getUserByEmail(email);
  if (!user) return { ok: false, error: "invalid credentials" };
  if (!verifyPassword(password, user.passwordHash)) return { ok: false, error: "invalid credentials" };

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const session: Session = {
    token,
    userId: user.id,
    expiresAt: Date.now() + 3600000,
  };
  sessions.set(session.token, session);
  return { ok: true, data: session };
}

export function verify(token: string): Result<Session> {
  const s = sessions.get(token);
  if (!s) return { ok: false, error: "invalid token" };
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return { ok: false, error: "expired" };
  }
  return { ok: true, data: s };
}

export function logout(token: string) {
  sessions.delete(token);
}

export function requireAdmin(token: string): Result<null> {
  const s = verify(token);
  if (!s.ok) return s;
  const user = getUser(s.data.userId);
  if (!user || user.role !== "admin") return { ok: false, error: "forbidden" };
  return { ok: true, data: null };
}