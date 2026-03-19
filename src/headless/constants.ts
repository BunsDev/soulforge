import type { ForgeMode } from "../types/index.js";

export const RST = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const PURPLE = "\x1b[38;2;155;48;255m";
export const DIM = "\x1b[2m";
export const RED = "\x1b[38;2;255;0;64m";
export const GREEN = "\x1b[38;2;0;200;80m";
export const YELLOW = "\x1b[38;2;255;200;0m";

export const VALID_MODES: ForgeMode[] = [
  "default",
  "architect",
  "socratic",
  "challenge",
  "plan",
  "auto",
];

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_TIMEOUT = 2;
export const EXIT_ABORT = 130;

export const VERSION = "1.0.0";
