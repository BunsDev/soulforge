import { spawn } from "node:child_process";
import type { ToolResult } from "../../types";
import { isForbidden } from "../security/forbidden.js";

const DEFAULT_TIMEOUT = 30_000;

// Patterns that extract file content from shell commands
const FILE_ACCESS_RE = /\b(cat|head|tail|less|more|bat|xxd|hexdump|strings|base64)\s+(.+)/;

function checkShellForbidden(command: string): string | null {
  const match = command.match(FILE_ACCESS_RE);
  if (!match) return null;
  // Extract potential file paths from the command args
  const args = (match[2] ?? "").split(/\s+/).filter((a) => !a.startsWith("-"));
  for (const arg of args) {
    const blocked = isForbidden(arg.replace(/['"]/g, ""));
    if (blocked) return blocked;
  }
  return null;
}

interface ShellArgs {
  command: string;
  cwd?: string;
  timeout?: number;
}

export const shellTool = {
  name: "shell",
  description: "Execute a shell command and return its output.",
  execute: async (args: ShellArgs): Promise<ToolResult> => {
    const command = args.command;
    const cwd = args.cwd ?? process.cwd();

    // Check if the command tries to read forbidden files
    const blocked = checkShellForbidden(command);
    if (blocked) {
      const msg = `Access denied: command references a file matching forbidden pattern "${blocked}".`;
      return { success: false, output: msg, error: msg };
    }
    const timeout = args.timeout ?? DEFAULT_TIMEOUT;

    return new Promise((resolve) => {
      const chunks: string[] = [];
      const errChunks: string[] = [];

      const proc = spawn("sh", ["-c", command], {
        cwd,
        timeout,
        env: { ...process.env },
      });

      proc.stdout.on("data", (data: Buffer) => chunks.push(data.toString()));
      proc.stderr.on("data", (data: Buffer) => errChunks.push(data.toString()));

      proc.on("close", (code: number | null) => {
        const stdout = chunks.join("");
        const stderr = errChunks.join("");

        if (code === 0) {
          resolve({ success: true, output: stdout || stderr });
        } else {
          resolve({
            success: false,
            output: stdout,
            error: stderr || `Exit code: ${code}`,
          });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, output: err.message, error: err.message });
      });
    });
  },
};
