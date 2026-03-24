import { useMemo } from "react";
import { useCompactionLogStore } from "../../stores/compaction-logs.js";
import { timeAgo, truncLine } from "../../utils/time.js";
import { LogViewer, type LogViewerConfig, type LogViewerEntry } from "./LogViewer.js";

interface CompactionEntry extends LogViewerEntry {
  kind: string;
  message: string;
  model?: string;
  strategy?: string;
  slotsBefore?: number;
  contextBefore?: string;
  contextAfter?: string;
  messagesBefore?: number;
  messagesAfter?: number;
  summarySnippet?: string;
  summaryLength?: number;
}

const KIND_ICONS: Record<string, { icon: string; color: string }> = {
  compact: { icon: "◆", color: "#9B30FF" },
  "strategy-change": { icon: "⇄", color: "#f80" },
  "auto-trigger": { icon: "⚡", color: "#2d5" },
  error: { icon: "✗", color: "#FF0040" },
};

const COMPACTION_CONFIG: LogViewerConfig<CompactionEntry> = {
  title: "Compaction Log",
  titleIcon: "◆",
  titleColor: "#336",
  borderColor: "#336",
  accentColor: "#336",
  cursorColor: "#336",
  heightRatio: 0.8,
  emptyMessage: "no compaction events yet",
  emptyFilterMessage: "no matching events",
  filterPlaceholder: "type to filter...",
  countLabel: (n) => `${String(n)} ${n === 1 ? "event" : "events"}`,
  detailSectionColor: "#336",
  filterFn: (e, q) =>
    e.kind.includes(q) ||
    e.message.toLowerCase().includes(q) ||
    (e.model?.toLowerCase().includes(q) ?? false) ||
    (e.summarySnippet?.toLowerCase().includes(q) ?? false),
  renderListRow: (entry, innerW) => {
    const kindInfo = KIND_ICONS[entry.kind] ?? { icon: "•", color: "#aaa" };
    const kindLabel = entry.kind.padEnd(16);
    const ts = timeAgo(entry.timestamp);
    const modelStr = entry.model ? ` [${entry.model}]` : "";
    const summaryMax = innerW - 16 - ts.length - modelStr.length - 10;
    return {
      icon: kindInfo.icon,
      iconColor: kindInfo.color,
      label: kindLabel,
      summary: truncLine(entry.message, summaryMax),
      extra: modelStr || undefined,
      extraColor: "#9B30FF",
      timeStr: ts,
    };
  },
  getDetailHeader: (entry) => {
    const kindInfo = KIND_ICONS[entry.kind] ?? { icon: "•", color: "#aaa" };
    return {
      icon: kindInfo.icon,
      iconColor: kindInfo.color,
      label: entry.kind,
      sublabel: entry.model,
      sublabelColor: "#9B30FF",
      timeStr: timeAgo(entry.timestamp),
    };
  },
  getDetailLines: (entry) => {
    const lines: string[] = [];
    lines.push(`Kind: ${entry.kind}`);
    lines.push(`Time: ${new Date(entry.timestamp).toLocaleTimeString()}`);
    if (entry.model) lines.push(`Model: ${entry.model}`);
    if (entry.strategy) lines.push(`Strategy: ${entry.strategy}`);
    if (entry.contextBefore || entry.contextAfter)
      lines.push(`Context: ${entry.contextBefore ?? "?"} → ${entry.contextAfter ?? "?"}`);
    if (entry.messagesBefore !== undefined || entry.messagesAfter !== undefined)
      lines.push(
        `Messages: ${String(entry.messagesBefore ?? "?")} → ${String(entry.messagesAfter ?? "?")}`,
      );
    if (entry.slotsBefore !== undefined) lines.push(`V2 Slots: ${String(entry.slotsBefore)}`);
    if (entry.summaryLength !== undefined)
      lines.push(`Summary: ${String(entry.summaryLength)} chars`);
    if (entry.summarySnippet) {
      lines.push("");
      lines.push("── Summary ──");
      lines.push(...entry.summarySnippet.split("\n"));
    }
    return lines;
  },
  getCopyText: (entry) => entry.summarySnippet ?? entry.message,
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CompactionLog({ visible, onClose }: Props) {
  const storeEntries = useCompactionLogStore((s) => s.entries);
  const entries = useMemo(
    () =>
      [...storeEntries]
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((e) => ({ ...e }) as CompactionEntry),
    [storeEntries],
  );

  return (
    <LogViewer visible={visible} onClose={onClose} entries={entries} config={COMPACTION_CONFIG} />
  );
}
