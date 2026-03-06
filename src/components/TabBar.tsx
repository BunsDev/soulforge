import { TextAttributes } from "@opentui/core";
import type { Tab } from "../hooks/useTabs.js";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSwitch: (id: string) => void;
}

function truncateLabel(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function TabBar({ tabs, activeTabId, onSwitch: _onSwitch }: TabBarProps) {
  if (tabs.length < 2) return null;

  return (
    <box flexShrink={0} paddingX={1} height={1} flexDirection="row">
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId;
        const label = truncateLabel(tab.label, 16);
        const num = String(i + 1);
        return (
          <box key={tab.id} flexDirection="row">
            {i > 0 && <text fg="#333"> · </text>}
            <text
              fg={isActive ? "#8B5CF6" : "#555"}
              attributes={isActive ? TextAttributes.BOLD : undefined}
            >
              {num} {label}
            </text>
          </box>
        );
      })}
      <text fg="#333"> · </text>
      <text fg="#444">+ new Alt+T</text>
    </box>
  );
}
