import { useCallback, useEffect, useRef, useState } from "react";
import { setNvimInstance } from "../core/editor/instance.js";
import {
  getBufferName,
  getCursorPosition,
  getVisualSelection,
  launchNeovim,
  type NvimInstance,
  openFile as nvimOpenFile,
  shutdownNeovim,
} from "../core/editor/neovim.js";
import type { ScreenSegment } from "../core/editor/screen.js";
import type { NvimConfigMode } from "../types/index.js";

export interface UseNeovimReturn {
  ready: boolean;
  screenLines: ScreenSegment[][];
  defaultBg: string | undefined;
  modeName: string;
  fileName: string | null;
  cursorLine: number;
  cursorCol: number;
  visualSelection: string | null;
  openFile: (path: string) => Promise<void>;
  sendKeys: (keys: string) => Promise<void>;
  error: string | null;
}

export function useNeovim(
  active: boolean,
  nvimPath?: string,
  nvimConfig?: NvimConfigMode,
  onExit?: () => void,
): UseNeovimReturn {
  const nvimRef = useRef<NvimInstance | null>(null);
  const mountedRef = useRef(true);
  const launchingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [screenLines, setScreenLines] = useState<ScreenSegment[][]>([]);
  const [defaultBg, setDefaultBg] = useState<string | undefined>("#1a1a2e");
  const [modeName, setModeName] = useState("normal");
  const [fileName, setFileName] = useState<string | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(0);
  const [visualSelection, setVisualSelection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable ref for onExit so it doesn't re-trigger the launch effect
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  // Launch neovim on first active=true
  useEffect(() => {
    if (!active || nvimRef.current || launchingRef.current) return;

    launchingRef.current = true;

    // Compute dimensions to match the actual editor panel:
    // Panel is 60% width with round border (2 chars horizontal, 2 rows vertical)
    // Vertical: app header(1) + app footer(1) + border(2) + title(1) + sep(1) + sep(1) + bottom bar(1) = 8
    const termCols = process.stdout.columns ?? 120;
    const termRows = process.stdout.rows ?? 40;
    const panelCols = Math.max(20, Math.floor(termCols * 0.6) - 2);
    const panelRows = Math.max(6, termRows - 8);

    launchNeovim(nvimPath ?? "nvim", panelCols, panelRows, nvimConfig)
      .then((nvim) => {
        if (!mountedRef.current) {
          shutdownNeovim(nvim).catch(() => {});
          return;
        }
        nvimRef.current = nvim;
        setNvimInstance(nvim);

        // Event-driven screen updates: fire on neovim flush instead of polling
        nvim.screen.onFlush = () => {
          if (!mountedRef.current) return;
          const { screen } = nvim;
          if (screen.dirty) {
            screen.dirty = false;
            setScreenLines(screen.getSegmentedLines());
            setDefaultBg(screen.getDefaultBg());
            setModeName(screen.modeName);
          }
        };

        // Flush any initial events that arrived before onFlush was set
        // (nvim_ui_attach triggers redraw events during the async handshake)
        if (nvim.screen.dirty) {
          nvim.screen.dirty = false;
          setScreenLines(nvim.screen.getSegmentedLines());
          setDefaultBg(nvim.screen.getDefaultBg());
          setModeName(nvim.screen.modeName);
        }

        setReady(true);
        setError(null);

        // Detect when neovim exits (user runs :q, :qa, etc.)
        nvim.process.on("close", () => {
          if (!mountedRef.current) return;
          nvimRef.current = null;
          setNvimInstance(null);
          setReady(false);
          onExitRef.current?.();
        });
      })
      .catch((err: unknown) => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        launchingRef.current = false;
      });
  }, [active, nvimPath, nvimConfig]);

  // Poll buffer name, cursor position, and visual selection (~2s) when ready
  useEffect(() => {
    if (!ready || !active) return;

    const interval = setInterval(() => {
      const nvim = nvimRef.current;
      if (!nvim || !mountedRef.current) return;

      Promise.all([getBufferName(nvim), getCursorPosition(nvim), getVisualSelection(nvim)])
        .then(([name, cursor, selection]) => {
          if (!mountedRef.current) return;
          if (name) setFileName((prev) => (prev === name ? prev : name));
          setCursorLine((prev) => (prev === cursor.line ? prev : cursor.line));
          setCursorCol((prev) => (prev === cursor.col ? prev : cursor.col));
          setVisualSelection((prev) => (prev === selection ? prev : selection));
        })
        .catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, [ready, active]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const nvim = nvimRef.current;
      if (nvim) {
        nvim.screen.onFlush = null;
        setNvimInstance(null);
        shutdownNeovim(nvim).catch(() => {});
        nvimRef.current = null;
      }
    };
  }, []);

  const openFile = useCallback(async (path: string) => {
    const nvim = nvimRef.current;
    if (!nvim || !mountedRef.current) return;
    try {
      await nvimOpenFile(nvim, path);
      if (mountedRef.current) {
        setFileName(path);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  const sendKeys = useCallback(async (keys: string) => {
    const nvim = nvimRef.current;
    if (!nvim || !mountedRef.current) return;
    try {
      await nvim.api.input(keys);
    } catch {
      // Fire-and-forget — ignore errors
    }
  }, []);

  return {
    ready,
    screenLines,
    defaultBg,
    modeName,
    fileName,
    cursorLine,
    cursorCol,
    visualSelection,
    openFile,
    sendKeys,
    error,
  };
}
