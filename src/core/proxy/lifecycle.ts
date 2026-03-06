import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logBackgroundError } from "../../stores/errors.js";
import { getVendoredPath, installProxy } from "../setup/install.js";

let proxyProcess: ChildProcess | null = null;

const PROXY_URL = process.env.PROXY_API_URL || "http://127.0.0.1:8317/v1";
const PROXY_API_KEY = process.env.PROXY_API_KEY || "soulforge";
const PROXY_CONFIG_DIR = join(homedir(), ".soulforge", "proxy");
const PROXY_CONFIG_PATH = join(PROXY_CONFIG_DIR, "config.yaml");

function ensureConfig(): void {
  if (existsSync(PROXY_CONFIG_PATH)) return;
  mkdirSync(PROXY_CONFIG_DIR, { recursive: true });
  writeFileSync(
    PROXY_CONFIG_PATH,
    [
      "host: 127.0.0.1",
      "port: 8317",
      'auth-dir: "~/.cli-proxy-api"',
      "api-keys:",
      '  - "soulforge"',
      "",
    ].join("\n"),
  );
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getProxyBinary(): string | null {
  const vendored = getVendoredPath("cli-proxy-api");
  if (vendored) return vendored;
  if (commandExists("cli-proxy-api")) return "cli-proxy-api";
  if (commandExists("cliproxyapi")) return "cliproxyapi";
  return null;
}

export async function isProxyRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${PROXY_URL}/models`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${PROXY_API_KEY}` },
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureProxy(): Promise<{ ok: boolean; error?: string }> {
  // Already running (externally or from a previous call)
  if (await isProxyRunning()) return { ok: true };

  // Get or install binary
  let binary = getProxyBinary();
  if (!binary) {
    try {
      binary = await installProxy();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to install CLIProxyAPI: ${msg}` };
    }
  }

  // Spawn background process
  ensureConfig();
  try {
    proxyProcess = spawn(binary, ["-config", PROXY_CONFIG_PATH], {
      detached: false,
      stdio: "ignore",
    });
    proxyProcess.unref();
    proxyProcess.on("error", (err) => {
      logBackgroundError("CLIProxyAPI", err.message);
      proxyProcess = null;
    });
    proxyProcess.on("exit", (code, signal) => {
      if (code != null && code !== 0) {
        logBackgroundError("CLIProxyAPI", `exited with code ${code}`);
      } else if (signal) {
        logBackgroundError("CLIProxyAPI", `killed by ${signal}`);
      }
      proxyProcess = null;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to spawn CLIProxyAPI: ${msg}` };
  }

  // Poll health endpoint
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isProxyRunning()) return { ok: true };
  }

  return {
    ok: false,
    error:
      "CLIProxyAPI started but not responding. You may need to authenticate — run /proxy login",
  };
}

export function stopProxy(): void {
  if (proxyProcess) {
    try {
      proxyProcess.kill();
    } catch {
      // already dead
    }
    proxyProcess = null;
  }
}

export function getProxyPid(): number | null {
  return proxyProcess?.pid ?? null;
}

export function proxyLogin(): { command: string; args: string[] } {
  const binary = getProxyBinary();
  ensureConfig();
  return {
    command: binary ?? "cli-proxy-api",
    args: ["-config", PROXY_CONFIG_PATH, "-claude-login"],
  };
}

export interface ProxyLoginHandle {
  promise: Promise<{ ok: boolean }>;
  abort: () => void;
}

export function runProxyLogin(onOutput: (line: string) => void): ProxyLoginHandle {
  const binary = getProxyBinary();
  if (!binary) {
    onOutput("CLIProxyAPI binary not found. Run /proxy install first.");
    return { promise: Promise.resolve({ ok: false }), abort: () => {} };
  }
  ensureConfig();

  const proc = spawn(binary, ["-config", PROXY_CONFIG_PATH, "-claude-login"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const handleData = (data: Buffer) => {
    const text = data.toString().trim();
    if (!text) return;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) onOutput(trimmed);
    }
  };

  proc.stdout?.on("data", handleData);
  proc.stderr?.on("data", handleData);

  const promise = new Promise<{ ok: boolean }>((resolve) => {
    proc.on("close", (code) => resolve({ ok: code === 0 }));
    proc.on("error", (err) => {
      onOutput(`Login failed: ${err.message}`);
      resolve({ ok: false });
    });
  });

  const abort = () => {
    try {
      proc.kill();
    } catch {}
  };

  return { promise, abort };
}

export interface ProxyStatus {
  installed: boolean;
  binaryPath: string | null;
  running: boolean;
  endpoint: string;
  pid: number | null;
  models: string[];
}

export async function fetchProxyStatus(): Promise<ProxyStatus> {
  const binaryPath = getProxyBinary();
  const pid = getProxyPid();
  const status: ProxyStatus = {
    installed: !!binaryPath,
    binaryPath,
    running: false,
    endpoint: PROXY_URL.replace(/\/v1$/, ""),
    pid,
    models: [],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${PROXY_URL}/models`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${PROXY_API_KEY}` },
    });
    clearTimeout(timeout);
    if (res.ok) {
      status.running = true;
      const data = (await res.json()) as { data?: { id: string }[] };
      status.models = (data.data ?? []).map((m) => m.id);
    }
  } catch {}

  return status;
}
