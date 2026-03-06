import { basename, relative } from "node:path";
import { TextAttributes } from "@opentui/core";
import { useMemo } from "react";
import { icon } from "../core/icons.js";
import type { ChatMessage } from "../types/index.js";

interface FileEntry {
  path: string;
  editCount: number;
  created: boolean;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: TreeNode[];
  file?: FileEntry;
}

function buildTree(files: FileEntry[], cwd: string): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", children: [] };

  for (const file of files) {
    const rel = relative(cwd, file.path) || file.path;
    const parts = rel.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const isLast = i === parts.length - 1;
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, fullPath: parts.slice(0, i + 1).join("/"), children: [] };
        current.children.push(child);
      }
      if (isLast) {
        child.file = file;
      }
      current = child;
    }
  }

  const collapse = (node: TreeNode): TreeNode => {
    node.children = node.children.map(collapse);
    if (node.children.length === 1 && !node.file) {
      const only = node.children[0];
      if (only && !only.file) {
        return {
          name: `${node.name}/${only.name}`,
          fullPath: only.fullPath,
          children: only.children,
          file: only.file,
        };
      }
    }
    return node;
  };

  root.children = root.children.map(collapse);
  return root;
}

function TreeRow({ node, prefix, isLast }: { node: TreeNode; prefix: string; isLast: boolean }) {
  const connector = isLast ? "└── " : "├── ";
  const childPrefix = isLast ? "    " : "│   ";
  const isDir = !node.file && node.children.length > 0;

  return (
    <>
      <box height={1} flexShrink={0}>
        <text truncate>
          <span fg="#333">
            {prefix}
            {connector}
          </span>
          {isDir ? (
            <span fg="#8B5CF6">{node.name}/</span>
          ) : (
            <>
              <span fg={node.file?.created ? "#2d5" : "#FF8C00"}>{node.name}</span>
              {node.file && node.file.editCount > 1 && (
                <span fg="#555"> ({String(node.file.editCount)})</span>
              )}
            </>
          )}
        </text>
      </box>
      {node.children.map((child, i) => (
        <TreeRow
          key={child.fullPath}
          node={child}
          prefix={`${prefix}${childPrefix}`}
          isLast={i === node.children.length - 1}
        />
      ))}
    </>
  );
}

const PREVIEW_COUNT = 3;
const MAX_COLUMNS = 3;

function TreeColumn({ node }: { node: TreeNode }) {
  const isDir = !node.file && node.children.length > 0;
  return (
    <box flexDirection="column" flexGrow={1} flexBasis={0} minWidth={0}>
      <box height={1} flexShrink={0}>
        <text truncate>
          {isDir ? (
            <span fg="#8B5CF6">{node.name}/</span>
          ) : (
            <>
              <span fg={node.file?.created ? "#2d5" : "#FF8C00"}>{node.name}</span>
              {node.file && node.file.editCount > 1 && (
                <span fg="#555"> ({String(node.file.editCount)})</span>
              )}
            </>
          )}
        </text>
      </box>
      {node.children.map((child, i) => (
        <TreeRow
          key={child.fullPath}
          node={child}
          prefix=""
          isLast={i === node.children.length - 1}
        />
      ))}
    </box>
  );
}

interface Props {
  messages: ChatMessage[];
  cwd: string;
  expanded: boolean;
}

export function ChangedFiles({ messages, cwd, expanded }: Props) {
  const files = useMemo(() => {
    const fileMap = new Map<string, FileEntry>();

    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name === "edit_file" && typeof tc.args.path === "string" && tc.result?.success) {
          const path = tc.args.path as string;
          const existing = fileMap.get(path);
          const isCreate = typeof tc.args.oldString === "string" && tc.args.oldString === "";
          if (existing) {
            existing.editCount++;
            if (isCreate) existing.created = true;
          } else {
            fileMap.set(path, { path, editCount: 1, created: isCreate });
          }
        }
      }
    }

    return [...fileMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [messages]);

  if (files.length === 0) return null;

  const tree = buildTree(files, cwd);
  const preview = files.slice(0, PREVIEW_COUNT);
  const remaining = files.length - preview.length;

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor="#FF8C00"
      paddingX={1}
      width="100%"
    >
      <box gap={1} flexDirection="row">
        <text fg="#FF8C00" attributes={TextAttributes.BOLD}>
          {icon("changes")} {String(files.length)} file{files.length === 1 ? "" : "s"} changed
        </text>
        {!expanded && (
          <>
            <text fg="#333">│</text>
            {preview.map((f) => (
              <text key={f.path} fg={f.created ? "#2d5" : "#888"}>
                {basename(f.path)}
              </text>
            ))}
            {remaining > 0 && <text fg="#555">+{String(remaining)}</text>}
            <text fg="#444">/changes</text>
          </>
        )}
      </box>
      {expanded && (
        <box flexDirection="column">
          <box flexDirection="row" gap={2}>
            {tree.children.slice(0, MAX_COLUMNS).map((child) => (
              <TreeColumn key={child.fullPath} node={child} />
            ))}
          </box>
          {tree.children.length > MAX_COLUMNS && (
            <box>
              <text fg="#555">
                +{String(tree.children.length - MAX_COLUMNS)} more group
                {tree.children.length - MAX_COLUMNS === 1 ? "" : "s"}
              </text>
            </box>
          )}
        </box>
      )}
    </box>
  );
}
