import { useEffect, useState } from "react";
import { getIntelligenceStatus } from "../core/intelligence/index.js";

export interface LspServerInfo {
  language: string;
  command: string;
}

export function useLspStatus(pollMs = 3000): LspServerInfo[] {
  const [servers, setServers] = useState<LspServerInfo[]>([]);

  useEffect(() => {
    const poll = () => {
      const status = getIntelligenceStatus();
      const next = status?.lspServers ?? [];
      setServers((prev) => {
        if (prev.length === next.length && prev.every((s, i) => s.command === next[i]?.command)) {
          return prev;
        }
        return next;
      });
    };
    poll();
    const id = setInterval(poll, pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  return servers;
}
