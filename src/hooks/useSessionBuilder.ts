import type { SessionMeta, TabMeta } from "../core/sessions/types.js";
import type { ChatMessage } from "../types/index.js";
import type { WorkspaceSnapshot } from "./useChat.js";

interface BuildParams {
  sessionId: string;
  title: string;
  cwd: string;
  snapshot: WorkspaceSnapshot;
  currentTabMessages: ChatMessage[];
  configOverrides?: Record<string, unknown> | null;
}

export function buildSessionMeta({
  sessionId,
  title,
  cwd,
  snapshot,
  currentTabMessages,
  configOverrides,
}: BuildParams): { meta: SessionMeta; tabMessages: Map<string, ChatMessage[]> } {
  const tabMessages = new Map<string, ChatMessage[]>();
  const tabs: TabMeta[] = [];

  for (const tabState of snapshot.tabStates) {
    const isActiveTab = tabState.id === snapshot.activeTabId || tabState.sessionId === sessionId;
    const msgs = isActiveTab
      ? currentTabMessages
      : tabState.messages.filter((m) => m.role !== "system");
    tabMessages.set(tabState.id, msgs);

    tabs.push({
      id: tabState.id,
      label: tabState.label,
      activeModel: tabState.activeModel,
      sessionId: tabState.sessionId,
      planMode: tabState.planMode,
      planRequest: tabState.planRequest,
      showPlanPanel: tabState.showPlanPanel,
      coAuthorCommits: tabState.coAuthorCommits,
      tokenUsage: tabState.tokenUsage,
      messageRange: { startLine: 0, endLine: msgs.length },
    });
  }

  const allMsgs = [...tabMessages.values()].flat();
  const startedAt = allMsgs[0]?.timestamp ?? Date.now();

  const meta: SessionMeta = {
    id: sessionId,
    title,
    cwd,
    startedAt,
    updatedAt: Date.now(),
    activeTabId: snapshot.activeTabId,
    forgeMode: snapshot.forgeMode,
    tabs,
    ...(configOverrides ? { configOverrides } : {}),
  };

  return { meta, tabMessages };
}
