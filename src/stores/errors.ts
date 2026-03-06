import { create } from "zustand";

export interface BackgroundError {
  id: string;
  source: string;
  message: string;
  timestamp: number;
}

interface ErrorStoreState {
  errors: BackgroundError[];
  push: (source: string, message: string) => void;
  clear: () => void;
}

export const useErrorStore = create<ErrorStoreState>()((set) => ({
  errors: [],
  push: (source, message) =>
    set((s) => ({
      errors: [...s.errors, { id: crypto.randomUUID(), source, message, timestamp: Date.now() }],
    })),
  clear: () => set({ errors: [] }),
}));

export function logBackgroundError(source: string, message: string): void {
  useErrorStore.getState().push(source, message);
}
