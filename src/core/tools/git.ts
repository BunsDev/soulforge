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
  execute: async () => {
    const s = await getGitStatus(cwd);
    if (!s.isRepo) return JSON.stringify({ error: "Not a git repository" });
    return JSON.stringify({
      branch: s.branch,
      staged: s.staged,
      modified: s.modified,
      untracked: s.untracked,
      ahead: s.ahead,
      behind: s.behind,
      isDirty: s.isDirty,
    });
  },
};

export const gitDiffTool = {
  name: "git_diff" as const,
  description: "Get git diff output. Use staged=true for staged changes, false for unstaged.",
  execute: async (args: { staged?: boolean }) => {
    const diff = await getGitDiff(cwd, args.staged);
    return diff || "No changes.";
  },
};

export const gitLogTool = {
  name: "git_log" as const,
  description: "View recent commit history.",
  execute: async (args: { count?: number }) => {
    const entries = await getGitLog(cwd, args.count ?? 10);
    if (entries.length === 0) return "No commits found.";
    return entries.map((e) => `${e.hash} ${e.subject} (${e.date})`).join("\n");
  },
};

export const gitCommitTool = {
  name: "git_commit" as const,
  description: "Stage files and commit. If files is omitted, commits currently staged files.",
  execute: async (args: { message: string; files?: string[] }) => {
    if (args.files && args.files.length > 0) {
      const ok = await gitAdd(cwd, args.files);
      if (!ok) return JSON.stringify({ error: "Failed to stage files" });
    }
    const result = await gitCommit(cwd, args.message);
    return JSON.stringify(result);
  },
};

export const gitPushTool = {
  name: "git_push" as const,
  description: "Push commits to the remote repository.",
  execute: async () => {
    const result = await gitPush(cwd);
    return JSON.stringify(result);
  },
};

export const gitPullTool = {
  name: "git_pull" as const,
  description: "Pull latest changes from the remote repository.",
  execute: async () => {
    const result = await gitPull(cwd);
    return JSON.stringify(result);
  },
};

export const gitStashTool = {
  name: "git_stash" as const,
  description: "Stash or pop changes. Set pop=true to pop the latest stash.",
  execute: async (args: { pop?: boolean; message?: string }) => {
    const result = args.pop ? await gitStashPop(cwd) : await gitStash(cwd, args.message);
    return JSON.stringify(result);
  },
};
