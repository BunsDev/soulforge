import { execFile } from "node:child_process";
import { create } from "zustand";
import { getIntelligenceChildPids } from "../core/intelligence/index.js";
import { getProxyPid } from "../core/proxy/lifecycle.js";

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  cacheRead: number;
  subagentInput: number;
  subagentOutput: number;
}

export const ZERO_USAGE: TokenUsage = {
  prompt: 0,
  completion: 0,
  total: 0,
  cacheRead: 0,
  subagentInput: 0,
  subagentOutput: 0,
};

interface StatusBarState {
  tokenUsage: TokenUsage;
  contextTokens: number;
  chatChars: number;
  subagentChars: number;
  rssMB: number;

  setTokenUsage: (usage: TokenUsage) => void;
  resetTokenUsage: () => void;
  setContext: (contextTokens: number, chatChars: number) => void;
  setSubagentChars: (chars: number) => void;
  setRssMB: (mb: number) => void;
}

export const useStatusBarStore = create<StatusBarState>()((set) => ({
  tokenUsage: { ...ZERO_USAGE },
  contextTokens: 0,
  chatChars: 0,
  subagentChars: 0,
  rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),

  setTokenUsage: (usage) => set({ tokenUsage: usage }),
  resetTokenUsage: () => set({ tokenUsage: { ...ZERO_USAGE } }),
  setContext: (contextTokens, chatChars) => set({ contextTokens, chatChars, subagentChars: 0 }),
  setSubagentChars: (chars) => set({ subagentChars: chars }),
  setRssMB: (mb) => set({ rssMB: mb }),
}));

export function resetStatusBarStore(): void {
  useStatusBarStore.setState({
    tokenUsage: { ...ZERO_USAGE },
    contextTokens: 0,
    chatChars: 0,
    subagentChars: 0,
  });
}

function collectChildPids(): number[] {
  const pids: number[] = [];
  const proxyPid = getProxyPid();
  if (proxyPid != null) pids.push(proxyPid);
  pids.push(...getIntelligenceChildPids());
  return pids;
}

function getChildRssKB(pids: number[]): Promise<number> {
  if (pids.length === 0) return Promise.resolve(0);
  return new Promise((resolve) => {
    execFile("ps", ["-o", "rss=", ...pids.map(String)], (err, stdout) => {
      if (err) {
        resolve(0);
        return;
      }
      let total = 0;
      for (const line of stdout.split("\n")) {
        const kb = Number.parseInt(line.trim(), 10);
        if (!Number.isNaN(kb)) total += kb;
      }
      resolve(total);
    });
  });
}

let memPollStarted = false;
export function startMemoryPoll(intervalMs = 2000) {
  if (memPollStarted) return;
  memPollStarted = true;
  setInterval(() => {
    const mainMB = process.memoryUsage().rss / 1024 / 1024;
    const childPids = collectChildPids();
    if (childPids.length === 0) {
      useStatusBarStore.getState().setRssMB(Math.round(mainMB));
      return;
    }
    getChildRssKB(childPids).then((childKB) => {
      const totalMB = mainMB + childKB / 1024;
      useStatusBarStore.getState().setRssMB(Math.round(totalMB));
    });
  }, intervalMs);
}
