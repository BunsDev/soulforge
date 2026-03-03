import { Box } from "ink";
import { useMemo } from "react";
import type { ChatMessage, Plan } from "../types/index.js";
import { ChangedFiles } from "./ChangedFiles.js";
import { PlanView } from "./PlanView.js";

export function RightSidebar({
  plan,
  messages,
  cwd,
}: {
  plan: Plan | null;
  messages: ChatMessage[];
  cwd: string;
}) {
  // Check if there are any changed files
  const hasChanges = useMemo(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue;
      for (const tc of msg.toolCalls) {
        if (tc.name === "edit_file" && tc.result?.success) return true;
      }
    }
    return false;
  }, [messages]);

  if (!plan && !hasChanges) return null;

  return (
    <Box flexDirection="column" flexShrink={0} width={34} paddingTop={1}>
      {plan && <PlanView plan={plan} mode="overlay" />}
      {hasChanges && <ChangedFiles messages={messages} cwd={cwd} />}
    </Box>
  );
}
