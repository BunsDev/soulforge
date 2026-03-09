import { TextAttributes } from "@opentui/core";
import { memo, useMemo } from "react";
import type { ChatMessage, Plan } from "../types/index.js";
import { ChangesPanel } from "./ChangedFiles.js";
import { PlanView } from "./PlanView.js";

export const RightSidebar = memo(function RightSidebar({
  plan,
  messages,
  cwd,
}: {
  plan: Plan | null;
  messages: ChatMessage[];
  cwd: string;
}) {
  const hasChanges = useMemo(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name === "edit_file" && tc.result?.success) return true;
      }
    }
    return false;
  }, [messages]);

  return (
    <box flexDirection="column" flexShrink={0} flexGrow={1} width={34}>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor="#8B5CF6"
        width={32}
        overflow="hidden"
        flexGrow={1}
      >
        {/* Panel title */}
        <box height={1} paddingLeft={2}>
          <text fg="#8B5CF6" attributes={TextAttributes.BOLD}>
            {"\uDB82\uDD28"} Panel
          </text>
        </box>
        <box height={1} paddingLeft={2}>
          <text fg="#333">{"─".repeat(26)}</text>
        </box>

        {/* Plan section */}
        {plan ? (
          <PlanView plan={plan} mode="overlay" />
        ) : (
          <box height={1} paddingLeft={2}>
            <text fg="#444">No plan yet</text>
          </box>
        )}

        {/* Separator */}
        <box height={1} paddingLeft={2}>
          <text fg="#333">{"─".repeat(26)}</text>
        </box>

        {/* Changes section */}
        {hasChanges ? (
          <ChangesPanel messages={messages} cwd={cwd} />
        ) : (
          <box height={1} paddingLeft={2}>
            <text fg="#444">No files changed</text>
          </box>
        )}
      </box>
    </box>
  );
});
