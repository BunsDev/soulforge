// ─── Tool Categories ───
// Displayed as a dim tag before the tool label, e.g. [lsp] Definition

export type ToolCategory =
  | "file"
  | "shell"
  | "git"
  | "lsp"
  | "tree-sitter"
  | "ts-morph"
  | "regex"
  | "code"
  | "web"
  | "memory"
  | "agent"
  | "ui"
  | "editor"
  | "execution"
  | "repo-map";

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // File tools
  read_file: "file",
  edit_file: "file",
  grep: "file",
  glob: "file",

  // Shell
  shell: "shell",

  // Git tools
  git_status: "git",
  git_diff: "git",
  git_log: "git",
  git_commit: "git",
  git_push: "git",
  git_pull: "git",
  git_stash: "git",

  // Code intelligence — backend resolved dynamically (ts-morph > lsp > tree-sitter > regex)
  navigate: "code",
  read_code: "code",
  analyze: "code",
  rename_symbol: "code",
  move_symbol: "code",
  refactor: "code",
  project: "shell",
  test_scaffold: "code",
  discover_pattern: "code",

  // Editor core (neovim buffer ops)
  editor_read: "editor",
  editor_edit: "editor",
  editor_navigate: "editor",
  editor_panel: "editor",

  // LSP (neovim language server)
  editor_diagnostics: "lsp",
  editor_symbols: "lsp",
  editor_hover: "lsp",
  editor_references: "lsp",
  editor_definition: "lsp",
  editor_actions: "lsp",
  editor_rename: "lsp",
  editor_lsp_status: "lsp",
  editor_format: "lsp",

  // Web
  web_search: "web",
  fetch_page: "web",

  // Memory
  memory_write: "memory",
  memory_read: "memory",
  memory_list: "memory",
  memory_search: "memory",
  memory_delete: "memory",

  // Agent / subagent
  dispatch: "agent",

  // Interactive UI
  plan: "ui",
  update_plan_step: "ui",
  ask_user: "ui",

  // Code execution (sandboxed)
  code_execution: "execution",
};

export const CATEGORY_COLORS: Record<string, string> = {
  file: "#5C9FD6",
  shell: "#FF0040",
  git: "#2d5",
  lsp: "#c678dd",
  "tree-sitter": "#e5c07b",
  "ts-morph": "#3178C6",
  regex: "#888",
  code: "#e5c07b",
  web: "#5CBBF6",
  memory: "#FF8C00",
  agent: "#FF00FF",
  ui: "#00BFFF",
  editor: "#5C9FD6",
  execution: "#FF0040",
  "repo-map": "#2dd4bf",
  brave: "#FB542B",
  ddg: "#DE5833",
  jina: "#FFAA00",
  "jina-api": "#FFAA00",
  readability: "#888",
  fetch: "#5CBBF6",
};

export const BACKEND_LABELS: Record<string, string> = {
  "jina-api": "jina 󰌆",
  jina: "jina",
  brave: "brave",
  ddg: "ddg",
  readability: "readability",
  fetch: "fetch",
};

// ─── Tool Icons ───

import { icon } from "./icons.js";

const TOOL_ICON_MAP: Record<string, string> = {
  read_file: "file",
  edit_file: "pencil",
  shell: "terminal",
  grep: "search",
  glob: "changes",
  dispatch: "explore",
  web_search: "globe",
  fetch_page: "file",
  memory_write: "bookmark",
  memory_read: "bookmark",
  memory_list: "bookmark",
  memory_search: "search",
  memory_delete: "trash_alt",
  editor_read: "file",
  editor_edit: "pencil",
  editor_navigate: "arrow_right",
  editor_diagnostics: "warning",
  editor_symbols: "plan",
  editor_hover: "brain_alt",
  editor_references: "references",
  editor_definition: "definition",
  editor_actions: "actions",
  editor_rename: "rename",
  editor_lsp_status: "cog",
  editor_format: "format",
  git_status: "git",
  git_diff: "git",
  git_log: "git",
  git_commit: "git",
  git_push: "git",
  git_pull: "git",
  git_stash: "git",
  read_code: "code",
  navigate: "arrow_right",
  analyze: "search",
  rename_symbol: "rename",
  move_symbol: "arrow_right",
  refactor: "wrench",
  project: "terminal",
  test_scaffold: "plan",
  discover_pattern: "search",
  editor_panel: "pencil",
  plan: "plan",
  update_plan_step: "check",
  ask_user: "question",
  code_execution: "code",
  _repomap: "repomap",
};

export function toolIcon(name: string): string {
  const key = TOOL_ICON_MAP[name];
  return key ? icon(key) : icon("wrench");
}

export const TOOL_ICONS = new Proxy({} as Record<string, string>, {
  get(_, prop: string) {
    return toolIcon(prop);
  },
});

// ─── Tool Labels ───

export const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading",
  edit_file: "Editing",
  shell: "Running",
  grep: "Searching",
  glob: "Globbing",
  dispatch: "Dispatching",
  web_search: "Searching web",
  fetch_page: "Fetching page",
  memory_write: "Recording",
  memory_read: "Recalling",
  memory_list: "Listing memories",
  memory_search: "Searching memory",
  memory_delete: "Forgetting",
  editor_read: "Reading buffer",
  editor_edit: "Editing buffer",
  editor_navigate: "Navigating",
  editor_diagnostics: "Diagnostics",
  editor_symbols: "Symbols",
  editor_hover: "Hover",
  editor_references: "References",
  editor_definition: "Definition",
  editor_actions: "Code actions",
  editor_rename: "Renaming",
  editor_lsp_status: "LSP status",
  editor_format: "Formatting",
  git_status: "Git status",
  git_diff: "Git diff",
  git_log: "Git log",
  git_commit: "Committing",
  git_push: "Pushing",
  git_pull: "Pulling",
  git_stash: "Stashing",
  read_code: "Reading code",
  navigate: "Navigating",
  analyze: "Analyzing",
  rename_symbol: "Renaming symbol",
  move_symbol: "Moving symbol",
  refactor: "Refactoring",
  project: "Project",
  test_scaffold: "Scaffolding tests",
  discover_pattern: "Discovering",
  editor_panel: "Opening editor",
  plan: "Planning",
  update_plan_step: "Updating plan",
  ask_user: "Asking",
  code_execution: "Executing",
};

// ─── Tool Icon Colors ───

export const TOOL_ICON_COLORS: Record<string, string> = {
  read_file: "#5C9FD6",
  edit_file: "#FF8C00",
  shell: "#FF0040",
  grep: "#FFDD57",
  glob: "#5C9FD6",
  dispatch: "#9B30FF",
  web_search: "#5CBBF6",
  fetch_page: "#5CBBF6",
  memory_write: "#FF8C00",
  memory_read: "#FF8C00",
  memory_list: "#FF8C00",
  memory_search: "#FF8C00",
  memory_delete: "#FF8C00",
  editor_read: "#5C9FD6",
  editor_edit: "#FF8C00",
  editor_navigate: "#5C9FD6",
  editor_diagnostics: "#FFDD57",
  editor_symbols: "#8B5CF6",
  editor_hover: "#8B5CF6",
  editor_references: "#8B5CF6",
  editor_definition: "#8B5CF6",
  editor_actions: "#8B5CF6",
  editor_rename: "#FF8C00",
  editor_lsp_status: "#8B5CF6",
  editor_format: "#8B5CF6",
  git_status: "#2d5",
  git_diff: "#2d5",
  git_log: "#2d5",
  git_commit: "#FF8C00",
  git_push: "#FF8C00",
  git_pull: "#2d5",
  git_stash: "#2d5",
  read_code: "#8B5CF6",
  navigate: "#8B5CF6",
  analyze: "#8B5CF6",
  rename_symbol: "#FF8C00",
  move_symbol: "#FF8C00",
  refactor: "#FF8C00",
  project: "#FF0040",
  test_scaffold: "#8B5CF6",
  discover_pattern: "#8B5CF6",
  plan: "#00BFFF",
  update_plan_step: "#00BFFF",
  ask_user: "#FF8C00",
  editor_panel: "#5C9FD6",
  code_execution: "#FF0040",
};
