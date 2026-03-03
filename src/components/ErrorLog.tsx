import { spawn } from "node:child_process";
import { Box, Text, useInput } from "ink";
import { ScrollList } from "ink-scroll-list";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../types/index.js";
import { POPUP_BG, POPUP_HL, PopupRow } from "./shared.js";

const POPUP_WIDTH = 90;
const MAX_VISIBLE = 14;
const MAX_DETAIL_LINES = 20;

type LogEntryKind = "tool-ok" | "tool-error" | "request-error";

interface LogEntry {
  id: string;
  kind: LogEntryKind;
  name: string;
  timestamp: number;
  summary: string;
  detail: string;
  args?: string;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${String(days)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function truncLine(str: string, max: number): string {
  const line = str.split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function copyToClipboard(text: string): void {
  const cmd = process.platform === "darwin" ? "pbcopy" : "xclip";
  const args = process.platform === "darwin" ? [] : ["-selection", "clipboard"];
  const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
  proc.stdin.write(text);
  proc.stdin.end();
}

function extractLogEntries(messages: ChatMessage[]): LogEntry[] {
  const entries: LogEntry[] = [];

  for (const msg of messages) {
    if (msg.role === "assistant" && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        const success = tc.result?.success ?? false;
        const output = success
          ? (tc.result?.output ?? "")
          : (tc.result?.error ?? tc.result?.output ?? "");
        entries.push({
          id: tc.id,
          kind: success ? "tool-ok" : "tool-error",
          name: tc.name,
          timestamp: msg.timestamp,
          summary: truncLine(output, 50),
          detail: output,
          args: JSON.stringify(tc.args, null, 2),
        });
      }
    }

    if (msg.role === "system" && msg.content.startsWith("Request failed:")) {
      entries.push({
        id: `req-${String(msg.timestamp)}`,
        kind: "request-error",
        name: "Request Error",
        timestamp: msg.timestamp,
        summary: truncLine(msg.content.slice(16), 50),
        detail: msg.content,
      });
    }
  }

  return entries.reverse();
}

interface Props {
  visible: boolean;
  messages: ChatMessage[];
  onClose: () => void;
}

export function ErrorLog({ visible, messages, onClose }: Props) {
  const [cursor, setCursor] = useState(0);
  const [query, setQuery] = useState("");
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const detailRef = useRef<ScrollViewRef>(null);

  const innerW = POPUP_WIDTH - 2;

  const entries = useMemo(() => extractLogEntries(messages), [messages]);

  const filterQuery = query.toLowerCase().trim();
  const filtered = filterQuery
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(filterQuery) ||
          e.summary.toLowerCase().includes(filterQuery),
      )
    : entries;

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      setQuery("");
      setCursor(0);
      setDetailIndex(null);
      setCopied(false);
    }
  }, [visible]);

  const showCopied = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const inDetail = detailIndex !== null;
  const selectedEntry = inDetail ? filtered[detailIndex] : null;

  // Build detail lines for scroll
  const detailLines = useMemo(() => {
    if (!selectedEntry) return [];
    const lines: string[] = [];
    if (selectedEntry.args) {
      lines.push("── Args ──");
      lines.push(...selectedEntry.args.split("\n"));
      lines.push("");
    }
    const sectionLabel = selectedEntry.kind === "tool-ok" ? "── Output ──" : "── Error ──";
    lines.push(sectionLabel);
    lines.push(...selectedEntry.detail.split("\n"));
    return lines;
  }, [selectedEntry]);

  useInput(
    (_input, key) => {
      // ── Detail view ──
      if (inDetail) {
        if (key.escape || key.backspace) {
          setDetailIndex(null);
          return;
        }
        if (key.upArrow) {
          detailRef.current?.scrollBy(-1);
          return;
        }
        if (key.downArrow) {
          detailRef.current?.scrollBy(1);
          return;
        }
        if (_input === "y" && key.ctrl) {
          if (selectedEntry) {
            const text = selectedEntry.args
              ? `Args:\n${selectedEntry.args}\n\n${selectedEntry.detail}`
              : selectedEntry.detail;
            copyToClipboard(text);
            showCopied();
          }
          return;
        }
        return;
      }

      // ── List view ──
      if (key.escape) {
        onClose();
        return;
      }

      if (key.upArrow) {
        setCursor((prev) => (prev > 0 ? prev - 1 : Math.max(0, filtered.length - 1)));
        return;
      }
      if (key.downArrow) {
        setCursor((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        return;
      }

      if (key.return) {
        if (filtered[cursor]) {
          setDetailIndex(cursor);
        }
        return;
      }

      if (_input === "y" && key.ctrl) {
        const entry = filtered[cursor];
        if (entry) {
          const text = entry.args ? `Args:\n${entry.args}\n\n${entry.detail}` : entry.detail;
          copyToClipboard(text);
          showCopied();
        }
        return;
      }

      if (key.backspace || key.delete) {
        setQuery((prev) => prev.slice(0, -1));
        setCursor(0);
        return;
      }

      if (_input && !key.ctrl && !key.meta) {
        setQuery((prev) => prev + _input);
        setCursor(0);
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

  // ── Detail view render ──
  if (inDetail && selectedEntry) {
    const statusIcon = selectedEntry.kind === "tool-ok" ? "✓" : "✗";
    const statusColor = selectedEntry.kind === "tool-ok" ? "#2d5" : "#FF0040";

    return (
      <Box
        position="absolute"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        height="100%"
      >
        <Box flexDirection="column" borderStyle="round" borderColor="#8B5CF6" width={POPUP_WIDTH}>
          {/* Header */}
          <PopupRow w={innerW}>
            <Text color={statusColor} backgroundColor={POPUP_BG}>
              {statusIcon}
            </Text>
            <Text color="white" bold backgroundColor={POPUP_BG}>
              {" "}
              {selectedEntry.name}
            </Text>
            <Text color="#555" backgroundColor={POPUP_BG}>
              {"  "}
              {timeAgo(selectedEntry.timestamp)}
            </Text>
            {copied && (
              <Text color="#2d5" backgroundColor={POPUP_BG}>
                {"  "}Copied!
              </Text>
            )}
          </PopupRow>

          {/* Separator */}
          <PopupRow w={innerW}>
            <Text color="#333" backgroundColor={POPUP_BG}>
              {"─".repeat(innerW - 4)}
            </Text>
          </PopupRow>

          {/* Detail content */}
          <ScrollView ref={detailRef} height={Math.min(detailLines.length, MAX_DETAIL_LINES)}>
            {detailLines.map((line, i) => {
              const isSection = line.startsWith("──");
              return (
                <PopupRow key={String(i)} w={innerW}>
                  <Text
                    color={isSection ? "#8B5CF6" : "#aaa"}
                    bold={isSection}
                    backgroundColor={POPUP_BG}
                    wrap="truncate"
                  >
                    {line.length > innerW - 4 ? `${line.slice(0, innerW - 5)}…` : line || " "}
                  </Text>
                </PopupRow>
              );
            })}
          </ScrollView>

          {/* Spacer */}
          <PopupRow w={innerW}>
            <Text>{""}</Text>
          </PopupRow>

          {/* Hints */}
          <PopupRow w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              {"↑↓"} scroll {"^Y"} copy esc/bksp back
            </Text>
          </PopupRow>
        </Box>
      </Box>
    );
  }

  // ── List view render ──
  return (
    <Box
      position="absolute"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" borderStyle="round" borderColor="#8B5CF6" width={POPUP_WIDTH}>
        {/* Title */}
        <PopupRow w={innerW}>
          <Text color="white" bold backgroundColor={POPUP_BG}>
            {"\uF06A"} Error Log
          </Text>
          <Text color="#555" backgroundColor={POPUP_BG}>
            {" "}
            ({String(entries.length)} entries)
          </Text>
          {copied && (
            <Text color="#2d5" backgroundColor={POPUP_BG}>
              {"  "}Copied!
            </Text>
          )}
        </PopupRow>

        {/* Search */}
        <PopupRow w={innerW}>
          <Text color="#9B30FF" backgroundColor={POPUP_BG}>
            {" "}
          </Text>
          <Text color={query ? "white" : "#555"} backgroundColor={POPUP_BG}>
            {query || "type to search entries..."}
          </Text>
          <Text color="#FF0040" backgroundColor={POPUP_BG}>
            {"\u2588"}
          </Text>
        </PopupRow>

        {/* Separator */}
        <PopupRow w={innerW}>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </Text>
        </PopupRow>

        {/* Entry list */}
        {filtered.length === 0 ? (
          <PopupRow w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              {query ? "no matching entries" : "no tool calls or errors yet"}
            </Text>
          </PopupRow>
        ) : (
          <ScrollList selectedIndex={cursor} height={Math.min(filtered.length, MAX_VISIBLE)}>
            {filtered.map((entry, i) => {
              const isActive = i === cursor;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              const statusIcon = entry.kind === "tool-ok" ? "✓" : "✗";
              const statusColor = entry.kind === "tool-ok" ? "#2d5" : "#FF0040";
              const nameMax = 20;
              const summaryMax = innerW - nameMax - 22;
              const name =
                entry.name.length > nameMax
                  ? `${entry.name.slice(0, nameMax - 1)}…`
                  : entry.name.padEnd(nameMax);
              const summary = truncLine(entry.summary, summaryMax);

              return (
                <PopupRow key={entry.id} bg={bg} w={innerW}>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                    {isActive ? "› " : "  "}
                  </Text>
                  <Text backgroundColor={bg} color={statusColor}>
                    {statusIcon}{" "}
                  </Text>
                  <Text backgroundColor={bg} color={isActive ? "white" : "#aaa"} bold={isActive}>
                    {name}
                  </Text>
                  <Text backgroundColor={bg} color="#666">
                    {" "}
                    {summary}
                  </Text>
                  <Text backgroundColor={bg} color="#444">
                    {"  "}
                    {timeAgo(entry.timestamp)}
                  </Text>
                </PopupRow>
              );
            })}
          </ScrollList>
        )}

        {/* Spacer */}
        <PopupRow w={innerW}>
          <Text>{""}</Text>
        </PopupRow>

        {/* Hints */}
        <PopupRow w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            {"↑↓"} nav {"⏎"} detail {"^Y"} copy esc close
          </Text>
        </PopupRow>
      </Box>
    </Box>
  );
}
