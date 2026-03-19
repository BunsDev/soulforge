import type { ForgeMode } from "../types/index.js";

export interface HeadlessRunOptions {
  prompt: string;
  modelId?: string;
  mode?: ForgeMode;
  json?: boolean;
  events?: boolean;
  quiet?: boolean;
  maxSteps?: number;
  timeout?: number;
  cwd?: string;
  sessionId?: string;
  saveSession?: boolean;
  system?: string;
  noRepomap?: boolean;
  include?: string[];
  diff?: boolean;
}

export type HeadlessAction =
  | { type: "run"; opts: HeadlessRunOptions }
  | { type: "list-providers" }
  | { type: "list-models"; provider?: string }
  | { type: "set-key"; provider: string; key: string }
  | { type: "version" };
