import { useCallback, useRef, useState } from "react";
import { rebuildCoreMessages } from "../core/sessions/rebuild.js";
import type { TabMeta } from "../core/sessions/types.js";
import type { ChatMessage } from "../types/index.js";
import type { ChatInstance, TabState } from "./useChat.js";

const MAX_TABS = 5;

export interface Tab {
  id: string;
  label: string;
}

export interface TabActivity {
  isLoading: boolean;
  hasUnread: boolean;
  hasError: boolean;
}

export interface UseTabsReturn {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab;
  tabCount: number;
  activeTabIndex: number;
  createTab: () => void;
  closeTab: (id: string) => boolean;
  switchTab: (id: string) => void;
  switchToIndex: (index: number) => void;
  nextTab: () => void;
  prevTab: () => void;
  renameTab: (id: string, label: string) => void;
  moveTab: (id: string, direction: "left" | "right") => void;
  autoLabel: (id: string, firstMessage: string) => void;
  setTabActivity: (id: string, activity: Partial<TabActivity>) => void;
  getTabActivity: (id: string) => TabActivity;
  registerChat: (id: string, chat: ChatInstance) => void;
  unregisterChat: (id: string) => void;
  getActiveChat: () => ChatInstance | null;
  getChat: (id: string) => ChatInstance | null;
  getAllTabStates: () => TabState[];
  initialStates: React.MutableRefObject<Map<string, TabState>>;
  restoreFromMeta: (
    tabMetas: TabMeta[],
    activeId: string,
    tabMessages: Map<string, ChatMessage[]>,
  ) => void;
}

const DEFAULT_ACTIVITY: TabActivity = { isLoading: false, hasUnread: false, hasError: false };

export function useTabs(): UseTabsReturn {
  const initialId = useRef(crypto.randomUUID()).current;
  const [tabs, setTabs] = useState<Tab[]>([{ id: initialId, label: "Tab 1" }]);
  const [activeTabId, setActiveTabId] = useState<string>(initialId);
  const tabCounter = useRef(1);
  const autoLabeled = useRef(new Set<string>());
  const chatRegistry = useRef(new Map<string, ChatInstance>());
  const activityMap = useRef(new Map<string, TabActivity>());
  const initialStates = useRef(new Map<string, TabState>());
  const [, forceRender] = useState(0);

  const activeTab = (tabs.find((t) => t.id === activeTabId) ?? tabs[0]) as (typeof tabs)[number];
  const activeTabIndex = tabs.findIndex((t) => t.id === activeTabId);

  const switchTab = useCallback(
    (targetId: string) => {
      if (targetId === activeTabId) return;
      if (!tabs.some((t) => t.id === targetId)) return;
      const activity = activityMap.current.get(targetId);
      if (activity && (activity.hasUnread || activity.hasError)) {
        activityMap.current.set(targetId, { ...activity, hasUnread: false, hasError: false });
      }
      setActiveTabId(targetId);
    },
    [activeTabId, tabs],
  );

  const createTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) return;
    tabCounter.current += 1;
    const newId = crypto.randomUUID();
    const newLabel = `Tab ${String(tabCounter.current)}`;
    setTabs((prev) => [...prev, { id: newId, label: newLabel }]);
    setActiveTabId(newId);
  }, [tabs.length]);

  const closeTab = useCallback(
    (targetId: string): boolean => {
      if (tabs.length <= 1) return false;
      const idx = tabs.findIndex((t) => t.id === targetId);
      if (idx === -1) return false;

      const chat = chatRegistry.current.get(targetId);
      if (chat?.isLoading) chat.abort();

      chatRegistry.current.delete(targetId);
      autoLabeled.current.delete(targetId);
      activityMap.current.delete(targetId);
      initialStates.current.delete(targetId);

      const newTabs = tabs.filter((t) => t.id !== targetId);
      setTabs(newTabs);

      if (targetId === activeTabId) {
        const newIdx = Math.min(idx, newTabs.length - 1);
        const newActiveId = newTabs[newIdx]?.id ?? newTabs[0]?.id ?? "";
        setActiveTabId(newActiveId);
      }

      return true;
    },
    [tabs, activeTabId],
  );

  const switchToIndex = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) switchTab(tab.id);
    },
    [tabs, switchTab],
  );

  const nextTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = (idx + 1) % tabs.length;
    const tab = tabs[nextIdx];
    if (tab) switchTab(tab.id);
  }, [tabs, activeTabId, switchTab]);

  const prevTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prevIdx = (idx - 1 + tabs.length) % tabs.length;
    const tab = tabs[prevIdx];
    if (tab) switchTab(tab.id);
  }, [tabs, activeTabId, switchTab]);

  const renameTab = useCallback((id: string, label: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, label } : t)));
    autoLabeled.current.add(id);
  }, []);

  const moveTab = useCallback((id: string, direction: "left" | "right") => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "left" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      const a = next[idx];
      const b = next[newIdx];
      if (a && b) {
        next[idx] = b;
        next[newIdx] = a;
      }
      return next;
    });
  }, []);

  const autoLabel = useCallback((id: string, firstMessage: string) => {
    if (autoLabeled.current.has(id)) return;
    autoLabeled.current.add(id);
    const label = firstMessage.trim().slice(0, 20) || "Tab";
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, label } : t)));
  }, []);

  const setTabActivity = useCallback(
    (id: string, activity: Partial<TabActivity>) => {
      const current = activityMap.current.get(id) ?? { ...DEFAULT_ACTIVITY };
      const updated = { ...current, ...activity };
      if (activity.hasUnread && id === activeTabId) {
        updated.hasUnread = false;
      }
      activityMap.current.set(id, updated);
      forceRender((n) => n + 1);
    },
    [activeTabId],
  );

  const getTabActivity = useCallback((id: string): TabActivity => {
    return activityMap.current.get(id) ?? { ...DEFAULT_ACTIVITY };
  }, []);

  const registerChat = useCallback((id: string, chat: ChatInstance) => {
    chatRegistry.current.set(id, chat);
    initialStates.current.delete(id);
  }, []);

  const unregisterChat = useCallback((id: string) => {
    chatRegistry.current.delete(id);
  }, []);

  const getActiveChat = useCallback((): ChatInstance | null => {
    return chatRegistry.current.get(activeTabId) ?? null;
  }, [activeTabId]);

  const getChat = useCallback((id: string): ChatInstance | null => {
    return chatRegistry.current.get(id) ?? null;
  }, []);

  const getAllTabStates = useCallback((): TabState[] => {
    const states: TabState[] = [];
    for (const tab of tabs) {
      const chat = chatRegistry.current.get(tab.id);
      if (chat) {
        states.push(chat.snapshot(tab.label));
      }
    }
    return states;
  }, [tabs]);

  const restoreFromMeta = useCallback(
    (tabMetas: TabMeta[], activeId: string, tabMessages: Map<string, ChatMessage[]>) => {
      if (tabMetas.length === 0) return;

      const restoredTabs: Tab[] = tabMetas.map((tm) => ({
        id: tm.id,
        label: tm.label,
      }));
      setTabs(restoredTabs);
      tabCounter.current = restoredTabs.length;

      for (const tm of tabMetas) {
        autoLabeled.current.add(tm.id);
      }

      const resolvedActiveId = tabMetas.some((tm) => tm.id === activeId)
        ? activeId
        : (tabMetas[0] as (typeof tabMetas)[number]).id;

      initialStates.current.clear();
      for (const tm of tabMetas) {
        const msgs = tabMessages.get(tm.id) ?? [];
        const state: TabState = {
          id: tm.id,
          label: tm.label,
          messages: msgs,
          coreMessages: rebuildCoreMessages(msgs),
          activeModel: tm.activeModel,
          activePlan: null,
          sidebarPlan: null,
          tokenUsage: { cacheRead: 0, subagentInput: 0, subagentOutput: 0, ...tm.tokenUsage },
          coAuthorCommits: tm.coAuthorCommits,
          sessionId: tm.sessionId,
          planMode: tm.planMode,
          planRequest: tm.planRequest,
        };
        initialStates.current.set(tm.id, state);
      }

      setActiveTabId(resolvedActiveId);
    },
    [],
  );

  return {
    tabs,
    activeTabId,
    activeTab,
    tabCount: tabs.length,
    activeTabIndex,
    createTab,
    closeTab,
    switchTab,
    switchToIndex,
    nextTab,
    prevTab,
    renameTab,
    moveTab,
    autoLabel,
    setTabActivity,
    getTabActivity,
    registerChat,
    unregisterChat,
    getActiveChat,
    getChat,
    getAllTabStates,
    initialStates,
    restoreFromMeta,
  };
}
