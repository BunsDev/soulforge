import type { ToolResult } from "../../types/index.js";
import {
  getGitDiff,
  getGitLog,
  getGitStatus,
  gitAdd,
  gitCommit,
  gitPull,
  gitPush,
  gitStash,
  gitStashPop,
} from "../git/status.js";

const cwd = process.cwd();

export const gitStatusTool = {
  name: "git_status" as const,
  description:
    "Get repository status: branch name, staged/modified/untracked files, ahead/behind counts.",
  execute: async (): Promise<ToolResult> => {
    const s = await getGitStatus(cwd);
    if (!s.isRepo) return { success: false, output: "Not a git repository", error: "not a repo" };
    const lines = [`Branch: ${s.branch ?? "detached"}`];
    if (s.staged.length > 0)
      lines.push(`Staged (${String(s.staged.length)}): ${s.staged.join(", ")}`);
    if (s.modified.length > 0)
      lines.push(`Modified (${String(s.modified.length)}): ${s.modified.join(", ")}`);
    if (s.untracked.length > 0)
      lines.push(`Untracked (${String(s.untracked.length)}): ${s.untracked.join(", ")}`);
    if (s.ahead > 0 || s.behind > 0)
      lines.push(`Ahead: ${String(s.ahead)} | Behind: ${String(s.behind)}`);
    lines.push(s.isDirty ? "Status: dirty" : "Status: clean");
    return { success: true, output: lines.join("\n") };
  },
};

export const gitDiffTool = {
  name: "git_diff" as const,
  description: "Get git diff output. Use staged=true for staged changes, false for unstaged.",
  execute: async (args: { staged?: boolean }): Promise<ToolResult> => {
    const diff = await getGitDiff(cwd, args.staged);
    return { success: true, output: diff || "No changes." };
  },
};

export const gitLogTool = {
  name: "git_log" as const,
  description: "View recent commit history.",
  execute: async (args: { count?: number }): Promise<ToolResult> => {
    const entries = await getGitLog(cwd, args.count ?? 10);
    if (entries.length === 0) return { success: true, output: "No commits found." };
    return {
      success: true,
      output: entries.map((e) => `${e.hash} ${e.subject} (${e.date})`).join("\n"),
    };
  },
};

export const gitCommitTool = {
  name: "git_commit" as const,
  description: "Stage files and commit. If files is omitted, commits currently staged files.",
  execute: async (args: { message: string; files?: string[] }): Promise<ToolResult> => {
    if (args.files && args.files.length > 0) {
      const ok = await gitAdd(cwd, args.files);
      if (!ok) return { success: false, output: "Failed to stage files", error: "staging failed" };
    }
    const result = await gitCommit(cwd, args.message);
    return { success: result.ok, output: result.output };
  },
};

export const gitPushTool = {
  name: "git_push" as const,
  description: "Push commits to the remote repository.",
  execute: async (): Promise<ToolResult> => {
    const result = await gitPush(cwd);
    return { success: result.ok, output: result.output };
  },
};

export const gitPullTool = {
  name: "git_pull" as const,
  description: "Pull latest changes from the remote repository.",
  execute: async (): Promise<ToolResult> => {
    const result = await gitPull(cwd);
    return { success: result.ok, output: result.output };
  },
};

export const gitStashTool = {
  name: "git_stash" as const,
  description: "Stash or pop changes. Set pop=true to pop the latest stash.",
  execute: async (args: { pop?: boolean; message?: string }): Promise<ToolResult> => {
    const result = args.pop ? await gitStashPop(cwd) : await gitStash(cwd, args.message);
    return { success: result.ok, output: result.output };
  },
};
