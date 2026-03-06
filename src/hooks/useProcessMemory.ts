import { useEffect, useState } from "react";

export interface ProcessMemory {
  heapMB: number;
  rssMB: number;
}

export function useProcessMemory(intervalMs = 2000): ProcessMemory {
  const [mem, setMem] = useState<ProcessMemory>(() => {
    const usage = process.memoryUsage();
    return {
      heapMB: Math.round(usage.heapUsed / 1024 / 1024),
      rssMB: Math.round(usage.rss / 1024 / 1024),
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const usage = process.memoryUsage();
      setMem({
        heapMB: Math.round(usage.heapUsed / 1024 / 1024),
        rssMB: Math.round(usage.rss / 1024 / 1024),
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return mem;
}
