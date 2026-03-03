import type { NvimInstance } from "./neovim.js";

/**
 * Module-level holder so tools (outside React) can access neovim.
 * The hook calls setNvimInstance() on ready/cleanup;
 * tools call getNvimInstance() to interact with the editor.
 */
let instance: NvimInstance | null = null;

export function setNvimInstance(nvim: NvimInstance | null): void {
  instance = nvim;
}

export function getNvimInstance(): NvimInstance | null {
  return instance;
}

/**
 * Wait for the neovim instance to become available.
 * Polls every 100ms up to timeoutMs (default 5s).
 * Returns the instance or null if timed out.
 */
export function waitForNvim(timeoutMs = 5000): Promise<NvimInstance | null> {
  if (instance) return Promise.resolve(instance);
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (instance) {
        resolve(instance);
      } else if (Date.now() - start > timeoutMs) {
        resolve(null);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}
