import { TextAttributes } from "@opentui/core";
import { icon } from "../../core/icons.js";
import { useTheme } from "../../core/theme/index.js";
import { getModeColor, getModeLabel } from "../../hooks/useForgeMode.js";
import type { Tab, TabActivity } from "../../hooks/useTabs.js";
import type { ForgeMode } from "../../types/index.js";
import { Spinner } from "./shared.js";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  getActivity: (id: string) => TabActivity;
  getMode: (id: string) => ForgeMode;
  getModelLabel: (id: string) => string | null;
}

function truncateLabel(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function TabBar({
  tabs,
  activeTabId,
  onSwitch: _onSwitch,
  getActivity,
  getMode,
  getModelLabel,
}: TabBarProps) {
  const activities = new Map(tabs.map((t) => [t.id, getActivity(t.id)]));

  const t = useTheme();

  return (
    <box flexShrink={0} paddingX={1} height={1} flexDirection="row">
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId;
        const num = String(i + 1);
        const activity = activities.get(tab.id);
        const isDefaultLabel = /^Tab \d+$/.test(tab.label);
        const label = isDefaultLabel ? null : truncateLabel(tab.label, 20);
        const tabMode = getMode(tab.id);
        const tabModeLabel = getModeLabel(tabMode);
        const tabModeColor = getModeColor(tabMode);

        const isLoading = activity?.isLoading ?? false;
        const isCompacting = activity?.isCompacting ?? false;
        const hasError = activity?.hasError ?? false;
        const hasUnread = activity?.hasUnread ?? false;
        const needsAttention = activity?.needsAttention ?? false;

        const stateColor = needsAttention
          ? t.warning
          : isCompacting
            ? t.info
            : isLoading
              ? t.brandAlt
              : hasError
                ? t.error
                : null;

        const numColor = isActive ? t.brand : (stateColor ?? t.textMuted);
        const labelColor = isActive ? t.textPrimary : hasUnread ? t.amber : t.textSecondary;

        return (
          <box key={tab.id} flexDirection="row">
            {i > 0 && <text fg={t.textDim}> │ </text>}
            {needsAttention && !isActive && <text fg={t.warning}>? </text>}
            {isCompacting && !needsAttention && <Spinner color={t.info} suffix={" "} />}
            {isLoading && !isCompacting && !needsAttention && (
              <Spinner color={t.brandAlt} suffix={" "} />
            )}
            {isActive && <text fg={t.brand}>▸ </text>}
            <text fg={numColor} attributes={isActive ? TextAttributes.BOLD : undefined}>
              {num}
            </text>
            {tabMode !== "default" && (
              <text fg={tabModeColor} attributes={isActive ? TextAttributes.BOLD : undefined}>
                {" "}
                {tabModeLabel}
              </text>
            )}
            {label && (
              <text fg={labelColor} attributes={isActive ? TextAttributes.BOLD : undefined}>
                {" "}
                {label}
              </text>
            )}
            {(activity?.editedFileCount ?? 0) > 0 && (
              <text fg={t.success}>
                {" "}
                {icon("pencil")}
                {String(activity?.editedFileCount ?? 0)}
              </text>
            )}
            {(() => {
              const modelLabel = getModelLabel(tab.id);
              if (!modelLabel) return null;
              return (
                <text fg={isActive ? t.textMuted : t.textDim}>
                  {" "}
                  {truncateLabel(modelLabel, 16)}
                </text>
              );
            })()}
            {hasUnread && !isLoading && !needsAttention && <text fg={t.amber}> ●</text>}
            {hasError && !isLoading && !needsAttention && <text fg={t.error}> ✗</text>}
          </box>
        );
      })}
    </box>
  );
}
