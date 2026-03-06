import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelMessage, StreamTextResult, TextPart, ToolCallPart, ToolSet } from "ai";
import { generateText, stepCountIs, ToolLoopAgent } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StreamSegment } from "../components/StreamSegmentList.js";
import type { LiveToolCall } from "../components/ToolCallDisplay.js";
import { createForgeAgent } from "../core/agents/index.js";
import { onAgentStats, onMultiAgentEvent } from "../core/agents/subagent-events.js";
import { buildSubagentTools, type SharedCacheRef } from "../core/agents/subagent-tools.js";
import type { ContextManager } from "../core/context/manager.js";
import { setCoAuthorEnabled } from "../core/git/status.js";
import { getModelContextWindow, getShortModelLabel } from "../core/llm/models.js";
import { resolveModel } from "../core/llm/provider.js";
import {
  buildProviderOptions,
  degradeProviderOptions,
  isProviderOptionsError,
} from "../core/llm/provider-options.js";
import { detectTaskType, resolveTaskModel } from "../core/llm/task-router.js";
import { SessionManager } from "../core/sessions/manager.js";
import { createThinkingParser } from "../core/thinking-parser.js";
import { onFileEditedEvent } from "../core/tools/file-events.js";
import { buildInteractiveTools, buildPlanModeTools, planFileName } from "../core/tools/index.js";
import { useStatusBarStore } from "../stores/statusbar.js";
import type {
  AppConfig,
  ChatMessage,
  InteractiveCallbacks,
  MessageSegment,
  PendingPlanReview,
  PendingQuestion,
  Plan,
  PlanReviewAction,
  PlanStepStatus,
  QueuedMessage,
} from "../types/index.js";
import { buildSessionMeta } from "./useSessionBuilder.js";

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── Types ───

export interface TabState {
  id: string;
  label: string;
  messages: ChatMessage[];
  coreMessages: ModelMessage[];
  activeModel: string;
  activePlan: Plan | null;
  sidebarPlan: Plan | null;
  showPlanPanel: boolean;
  tokenUsage: TokenUsage;
  coAuthorCommits: boolean;
  sessionId: string;
  planMode: boolean;
  planRequest: string | null;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  cacheRead: number;
  subagentInput: number;
  subagentOutput: number;
}

export const ZERO_USAGE: TokenUsage = {
  prompt: 0,
  completion: 0,
  total: 0,
  cacheRead: 0,
  subagentInput: 0,
  subagentOutput: 0,
};

export interface WorkspaceSnapshot {
  forgeMode: import("../types/index.js").ForgeMode;
  tabStates: TabState[];
  activeTabId: string;
}

export interface UseChatOptions {
  effectiveConfig: AppConfig;
  contextManager: ContextManager;
  sessionManager: SessionManager;
  cwd: string;
  openEditorWithFile: (file: string) => void;
  openEditor: () => void;
  onSuspend: (opts: { command: string; args?: string[]; noAltScreen?: boolean }) => void;
  initialState?: TabState;
  getWorkspaceSnapshot?: () => WorkspaceSnapshot;
  getConfigOverrides?: () => Record<string, unknown> | null;
}

export interface ChatInstance {
  // State
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  coreMessages: ModelMessage[];
  setCoreMessages: React.Dispatch<React.SetStateAction<ModelMessage[]>>;
  isLoading: boolean;
  streamSegments: StreamSegment[];
  liveToolCalls: LiveToolCall[];
  activePlan: Plan | null;
  setActivePlan: React.Dispatch<React.SetStateAction<Plan | null>>;
  sidebarPlan: Plan | null;
  setSidebarPlan: React.Dispatch<React.SetStateAction<Plan | null>>;
  showPlanPanel: boolean;
  setShowPlanPanel: React.Dispatch<React.SetStateAction<boolean>>;
  pendingQuestion: PendingQuestion | null;
  setPendingQuestion: React.Dispatch<React.SetStateAction<PendingQuestion | null>>;
  messageQueue: QueuedMessage[];
  setMessageQueue: React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
  activeModel: string;
  setActiveModel: React.Dispatch<React.SetStateAction<string>>;
  coAuthorCommits: boolean;
  setCoAuthorCommits: React.Dispatch<React.SetStateAction<boolean>>;
  tokenUsage: TokenUsage;
  setTokenUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
  contextTokens: number;
  lastStepOutput: number;
  chatChars: number;
  sessionId: string;
  planFile: string;
  planMode: boolean;
  planRequest: string | null;
  // Actions
  handleSubmit: (input: string) => Promise<void>;
  summarizeConversation: () => Promise<void>;
  abort: () => void;
  interactiveCallbacks: InteractiveCallbacks;
  // Plan mode
  setPlanMode: (on: boolean) => void;
  setPlanRequest: (req: string | null) => void;
  pendingPlanReview: PendingPlanReview | null;
  setPendingPlanReview: React.Dispatch<React.SetStateAction<PendingPlanReview | null>>;
  // Snapshot / restore for tab switching
  snapshot: (label: string) => TabState;
  restore: (state: TabState) => void;
  // Session
  restoreSession: (sessionId: string) => void;
  restoreFromTabState: (state: TabState) => void;
}

export function useChat({
  effectiveConfig,
  contextManager,
  sessionManager,
  cwd,
  openEditorWithFile,
  openEditor,
  initialState,
  getWorkspaceSnapshot,
  getConfigOverrides,
}: UseChatOptions): ChatInstance {
  const [messages, setMessages] = useState<ChatMessage[]>(initialState?.messages ?? []);
  const [coreMessages, setCoreMessages] = useState<ModelMessage[]>(
    initialState?.coreMessages ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [streamSegments, setStreamSegments] = useState<StreamSegment[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<LiveToolCall[]>([]);

  const streamSegmentsBuffer = useRef<StreamSegment[]>([]);
  const liveToolCallsBuffer = useRef<LiveToolCall[]>([]);
  const pendingTokenUsage = useRef<TokenUsage | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const segmentsDirty = useRef(false);
  const toolCallsDirty = useRef(false);
  const lastFlushedSegments = useRef<StreamSegment[]>([]);
  const lastFlushedToolCalls = useRef<LiveToolCall[]>([]);
  const lastFlushedStreamingChars = useRef(0);
  const flushStreamState = useCallback(() => {
    if (segmentsDirty.current) {
      const buf = streamSegmentsBuffer.current;
      const prev = lastFlushedSegments.current;
      let changed = buf.length !== prev.length;
      const next: StreamSegment[] = new Array(buf.length);
      for (let i = 0; i < buf.length; i++) {
        const s = buf[i] as StreamSegment;
        const p = prev[i];
        if (p && s.type === p.type) {
          let same = false;
          if (s.type === "text" && p.type === "text") {
            same = s.content === p.content;
          } else if (s.type === "reasoning" && p.type === "reasoning") {
            same = s.content === p.content && s.id === p.id && s.done === p.done;
          } else if (s.type === "tools" && p.type === "tools") {
            same =
              s.callIds.length === p.callIds.length &&
              s.callIds.every((id, j) => id === p.callIds[j]);
          }
          if (same) {
            next[i] = p;
            continue;
          }
        }
        changed = true;
        next[i] = s.type === "tools" ? { ...s, callIds: [...s.callIds] } : { ...s };
      }
      if (changed) {
        lastFlushedSegments.current = next;
        setStreamSegments(next);
      }
      segmentsDirty.current = false;
    }
    if (toolCallsDirty.current) {
      const buf = liveToolCallsBuffer.current;
      const prev = lastFlushedToolCalls.current;
      let changed = buf.length !== prev.length;
      const next: LiveToolCall[] = new Array(buf.length);
      for (let i = 0; i < buf.length; i++) {
        const tc = buf[i] as LiveToolCall;
        const p = prev[i];
        if (
          p &&
          tc.id === p.id &&
          tc.toolName === p.toolName &&
          tc.state === p.state &&
          tc.args === p.args &&
          tc.result === p.result &&
          tc.error === p.error
        ) {
          next[i] = p;
          continue;
        }
        changed = true;
        next[i] = { ...tc };
      }
      if (changed) {
        lastFlushedToolCalls.current = next;
        setLiveToolCalls(next);
      }
      toolCallsDirty.current = false;
    }
    const tu = pendingTokenUsage.current;
    if (tu) {
      setTokenUsageRaw(tu);
      useStatusBarStore.getState().setTokenUsage(tu);
      pendingTokenUsage.current = null;
    }
    const ct = pendingContextTokens.current;
    if (ct !== null) {
      setContextTokens(ct);
      pendingContextTokens.current = null;
    }
    const so = pendingLastStepOutput.current;
    if (so !== null) {
      setLastStepOutput(so);
      pendingLastStepOutput.current = null;
    }
    const nextChars = streamingCharsRef.current + toolCharsRef.current;
    if (nextChars !== lastFlushedStreamingChars.current) {
      lastFlushedStreamingChars.current = nextChars;
      setStreamingChars(nextChars);
    }
  }, []);

  const flushMicrotaskQueued = useRef(false);
  const queueMicrotaskFlush = useCallback(() => {
    if (flushMicrotaskQueued.current) return;
    flushMicrotaskQueued.current = true;
    queueMicrotask(() => {
      flushMicrotaskQueued.current = false;
      flushStreamState();
    });
  }, [flushStreamState]);

  // Interactive state
  const abortRef = useRef<AbortController | null>(null);
  const webSearchQueueRef = useRef<{ query: string; resolve: (ok: boolean) => void }[]>([]);
  const webSearchFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoApproveWebSearchRef = useRef(false);
  const webSearchModelLabelRef = useRef<string | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(initialState?.activePlan ?? null);
  const [sidebarPlan, setSidebarPlan] = useState<Plan | null>(initialState?.sidebarPlan ?? null);
  const [showPlanPanel, setShowPlanPanel] = useState(initialState?.showPlanPanel ?? false);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);

  // LLM state
  const [activeModel, setActiveModel] = useState(
    initialState?.activeModel ?? effectiveConfig.defaultModel,
  );
  const [coAuthorCommits, setCoAuthorCommits] = useState(initialState?.coAuthorCommits ?? true);

  // Sync co-author flag with git module
  useEffect(() => {
    setCoAuthorEnabled(coAuthorCommits);
  }, [coAuthorCommits]);

  const [tokenUsage, setTokenUsageRaw] = useState<TokenUsage>(
    initialState?.tokenUsage ?? { ...ZERO_USAGE },
  );
  const sessionIdRef = useRef<string>(initialState?.sessionId ?? crypto.randomUUID());
  const sharedCacheRef = useRef<SharedCacheRef>(
    (() => {
      const ref: SharedCacheRef = {
        current: undefined,
        updateFile(absPath: string, content: string) {
          if (!ref.current) return;
          const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
          const rel = absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath;
          ref.current.files.set(rel, content);
          for (const key of ref.current.toolResults.keys()) {
            if (key.includes(rel)) ref.current.toolResults.delete(key);
          }
        },
      };
      return ref;
    })(),
  );

  useEffect(() => {
    return onFileEditedEvent((absPath, content) =>
      sharedCacheRef.current.updateFile(absPath, content),
    );
  }, []);

  // Streaming token estimation
  const streamingCharsRef = useRef(0);
  const toolCharsRef = useRef(0);
  const [streamingChars, setStreamingChars] = useState(0);
  const baseTokenUsageRef = useRef<TokenUsage>({ ...ZERO_USAGE });
  const tokenUsageRef = useRef(tokenUsage);
  tokenUsageRef.current = tokenUsage;

  // Latest step's tokens = actual context size + generation reported by the API
  const [contextTokens, setContextTokens] = useState(0);
  const [lastStepOutput, setLastStepOutput] = useState(0);
  const pendingContextTokens = useRef<number | null>(null);
  const pendingLastStepOutput = useRef<number | null>(null);

  const setTokenUsage: typeof setTokenUsageRaw = useCallback((action) => {
    setTokenUsageRaw((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      if (next.total === 0) {
        baseTokenUsageRef.current = { ...ZERO_USAGE };
        streamingCharsRef.current = 0;
        toolCharsRef.current = 0;
        setContextTokens(0);
        setStreamingChars(0);
      }
      useStatusBarStore.getState().setTokenUsage(next);
      return next;
    });
  }, []);

  // Plan mode
  const [pendingPlanReview, setPendingPlanReview] = useState<PendingPlanReview | null>(null);
  const planPostActionRef = useRef<{
    action: "execute" | "clear_execute" | "cancel";
    planContent: string | null;
  } | null>(null);
  const planModeRef = useRef(initialState?.planMode ?? false);
  const planRequestRef = useRef<string | null>(initialState?.planRequest ?? null);

  const coreCharsCache = useRef({ len: 0, chars: 0 });
  const coreChars = useMemo(() => {
    const cache = coreCharsCache.current;
    let sum = cache.len <= coreMessages.length ? cache.chars : 0;
    const start = cache.len <= coreMessages.length ? cache.len : 0;
    for (let i = start; i < coreMessages.length; i++) {
      const m = coreMessages[i] as ModelMessage;
      if (typeof m.content === "string") {
        sum += m.content.length;
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          sum +=
            typeof part === "object" && part !== null && "text" in part
              ? String((part as { text: string }).text).length
              : JSON.stringify(part).length;
        }
      }
    }
    coreCharsCache.current = { len: coreMessages.length, chars: sum };
    return sum;
  }, [coreMessages]);

  const chatChars = coreChars + streamingChars;

  useEffect(() => {
    useStatusBarStore.getState().setContext(contextTokens, chatChars);
  }, [contextTokens, chatChars]);

  const coreMessagesRef = useRef(coreMessages);
  coreMessagesRef.current = coreMessages;
  const activeModelRef = useRef(activeModel);
  activeModelRef.current = activeModel;
  const summarizeConversation = useCallback(async () => {
    const currentCore = coreMessagesRef.current;
    if (currentCore.length < 4) return;
    try {
      const model = resolveModel(activeModelRef.current);

      const KEEP_RECENT = 4;
      const keepStart = Math.max(0, currentCore.length - KEEP_RECENT);
      const olderMessages = currentCore.slice(0, keepStart);
      const recentMessages = currentCore.slice(keepStart);

      if (olderMessages.length < 2) return;

      const formatMessage = (m: ModelMessage, charLimit: number) => {
        const role = m.role;
        if (typeof m.content === "string") {
          return `${role}: ${m.content.slice(0, charLimit)}`;
        }
        if (Array.isArray(m.content)) {
          const parts = m.content
            .map((p) => {
              if (typeof p === "object" && p !== null) {
                if ("text" in p) return String((p as { text: string }).text).slice(0, charLimit);
                if ("type" in p && (p as { type: string }).type === "tool-result") {
                  const tr = p as { toolName?: string; result?: unknown };
                  return `[tool-result: ${tr.toolName ?? "unknown"} → ${JSON.stringify(tr.result).slice(0, 1500)}]`;
                }
              }
              return JSON.stringify(p).slice(0, 1000);
            })
            .join("\n");
          return `${role}: ${parts}`;
        }
        return `${role}: [complex content]`;
      };

      const convoText = olderMessages.map((m) => formatMessage(m, 4000)).join("\n\n");

      const { text: summary } = await generateText({
        model,
        prompt: [
          "You are compacting the OLDER portion of a coding assistant conversation.",
          "The most recent messages will be preserved verbatim — focus on summarizing what came before.",
          "",
          "Create a structured summary with these sections:",
          "",
          "## Environment",
          "Project type, key technologies, working directory, any config details mentioned.",
          "",
          "## Files Touched",
          "Every file path that was read, edited, or created. Include what was done to each.",
          "",
          "## Key Decisions",
          "Architectural choices, design patterns chosen, trade-offs discussed.",
          "",
          "## Work Completed",
          "What was accomplished. Include specific function names, variable names, code patterns.",
          "",
          "## Errors & Resolutions",
          "Problems encountered and how they were resolved.",
          "",
          "## Current State",
          "What was being worked on at the end of this section. What remains to be done.",
          "",
          "Be thorough — this summary is the only record of the older conversation.",
          "",
          "CONVERSATION TO SUMMARIZE:",
          convoText,
        ].join("\n"),
      });

      const summaryMsg: ModelMessage = {
        role: "user" as const,
        content: [
          "[CONTEXT COMPACTION — Summary of earlier conversation]",
          "",
          summary,
          "",
          "[End of compacted context. Recent messages follow.]",
        ].join("\n"),
      };

      const ackMsg: ModelMessage = {
        role: "assistant" as const,
        content:
          "Understood. I have the context from our earlier conversation and will continue seamlessly.",
      };

      const newMessages = [summaryMsg, ackMsg, ...recentMessages];
      setCoreMessages(newMessages);

      const newChars = newMessages.reduce((sum, m) => {
        if (typeof m.content === "string") return sum + m.content.length;
        if (Array.isArray(m.content)) {
          return sum + m.content.reduce((s: number, p: unknown) => s + JSON.stringify(p).length, 0);
        }
        return sum;
      }, 0);
      const estimatedTokens = Math.ceil(newChars / 4);
      setContextTokens(0);
      setStreamingChars(0);
      setTokenUsage({ ...ZERO_USAGE, prompt: estimatedTokens, total: estimatedTokens });

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `Context compacted (${currentCore.length} → ${newMessages.length} messages, ~${estimatedTokens} tokens). Last ${recentMessages.length} messages preserved.`,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "Failed to compact conversation context.",
          timestamp: Date.now(),
        },
      ]);
    }
  }, [setTokenUsage]);

  const autoSummarizedRef = useRef(false);
  useEffect(() => {
    const systemChars = contextManager.getContextBreakdown().reduce((sum, s) => sum + s.chars, 0);
    const totalChars = systemChars + coreChars;
    const contextBudgetChars = getModelContextWindow(activeModelRef.current) * 4;
    const pct = totalChars / contextBudgetChars;
    if (pct > 0.7 && !autoSummarizedRef.current && coreMessagesRef.current.length >= 6) {
      autoSummarizedRef.current = true;
      summarizeConversation();
    }
    if (pct < 0.4) {
      autoSummarizedRef.current = false;
    }
  }, [coreChars, contextManager, summarizeConversation]);

  // Interactive callbacks for plan/question tools
  const interactiveCallbacks = useMemo<InteractiveCallbacks>(
    () => ({
      onPlanCreate: (plan: Plan) => {
        setActivePlan(plan);
        setSidebarPlan(plan);
        setShowPlanPanel(!!plan);
      },
      onPlanStepUpdate: (stepId: string, status: PlanStepStatus) => {
        const updater = (prev: Plan | null) => {
          if (!prev) return prev;
          return {
            ...prev,
            steps: prev.steps.map((s) => (s.id === stepId ? { ...s, status } : s)),
          };
        };
        setActivePlan(updater);
        setSidebarPlan(updater);
      },
      onPlanReview: (plan: Plan, planFile: string) => {
        return new Promise<PlanReviewAction>((resolve) => {
          setPendingPlanReview({
            plan,
            planFile,
            resolve: (action: PlanReviewAction) => {
              setPendingPlanReview(null);

              if (action === "clear_execute" || (action === "execute" && planModeRef.current)) {
                let content: string | null = null;
                try {
                  content = readFileSync(
                    join(cwd, ".soulforge", "plans", planFileName(sessionIdRef.current)),
                    "utf-8",
                  );
                } catch {
                  /* missing */
                }
                planPostActionRef.current = {
                  action: action === "clear_execute" ? "clear_execute" : "execute",
                  planContent: content,
                };
                resolve(action);
                abortRef.current?.abort();
                return;
              }

              if (action === "cancel" && planModeRef.current) {
                planPostActionRef.current = { action: "cancel", planContent: null };
                resolve(action);
                abortRef.current?.abort();
                return;
              }

              resolve(action);
            },
          });
        });
      },
      onAskUser: (question, options, allowSkip) => {
        return new Promise<string>((resolve) => {
          setPendingQuestion({
            id: crypto.randomUUID(),
            question,
            options,
            allowSkip,
            resolve: (answer) => {
              setPendingQuestion(null);
              resolve(answer);
            },
          });
        });
      },
      onOpenEditor: async (file?: string) => {
        if (file) {
          openEditorWithFile(file);
        } else {
          openEditor();
        }
      },
      onWebSearchApproval: (query: string) => {
        if (autoApproveWebSearchRef.current) return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
          webSearchQueueRef.current.push({ query, resolve });
          if (webSearchFlushRef.current === null) {
            webSearchFlushRef.current = setTimeout(() => {
              webSearchFlushRef.current = null;
              const batch = webSearchQueueRef.current.splice(0);
              if (batch.length === 0) return;

              const resolveAll = (answer: string) => {
                setPendingQuestion(null);
                const allowed = answer === "allow" || answer === "always";
                if (answer === "always") autoApproveWebSearchRef.current = true;
                for (const item of batch) item.resolve(allowed);
              };

              const modelNote = webSearchModelLabelRef.current
                ? `\nvia search agent (${webSearchModelLabelRef.current})`
                : "";

              if (batch.length === 1 && batch[0]) {
                const item = batch[0];
                setPendingQuestion({
                  id: crypto.randomUUID(),
                  question: `Forge wants to search the web for:\n\n"${item.query}"${modelNote}\n\nAllow this search?`,
                  options: [
                    { label: "Allow", value: "allow", description: "Run this search" },
                    {
                      label: "Always Allow",
                      value: "always",
                      description: "Auto-approve searches this session",
                    },
                    { label: "Deny", value: "deny", description: "Skip the search" },
                  ],
                  allowSkip: false,
                  resolve: resolveAll,
                });
              } else {
                const listing = batch
                  .map((item, i) => `${String(i + 1)}. "${item.query}"`)
                  .join("\n");
                setPendingQuestion({
                  id: crypto.randomUUID(),
                  question: `Forge wants to run ${String(batch.length)} web searches${modelNote}:\n\n${listing}\n\nAllow these searches?`,
                  options: [
                    { label: "Allow", value: "allow", description: "Run these searches" },
                    {
                      label: "Always Allow",
                      value: "always",
                      description: "Auto-approve searches this session",
                    },
                    { label: "Deny", value: "deny", description: "Skip these searches" },
                  ],
                  allowSkip: false,
                  resolve: resolveAll,
                });
              }
            }, 0);
          }
        });
      },
    }),
    [openEditor, openEditorWithFile, cwd],
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: input,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const currentCoreMessages = coreMessagesRef.current;
      const newCoreMessages: ModelMessage[] = [
        ...currentCoreMessages,
        { role: "user" as const, content: input },
      ];
      setCoreMessages(newCoreMessages);

      const estimatedTokens = tokenUsageRef.current.total;
      contextManager.updateConversationContext(input, estimatedTokens);

      setIsLoading(true);
      setPendingPlanReview(null);
      streamSegmentsBuffer.current = [];
      liveToolCallsBuffer.current = [];
      lastFlushedSegments.current = [];
      lastFlushedToolCalls.current = [];
      lastFlushedStreamingChars.current = 0;
      setStreamSegments([]);
      setLiveToolCalls([]);
      setActivePlan(null);
      setPendingQuestion(null);

      // Capture pre-stream token baseline for live estimation
      streamingCharsRef.current = 0;
      toolCharsRef.current = 0;
      const currentUsage = tokenUsageRef.current;
      baseTokenUsageRef.current = { ...currentUsage };

      // Abort controller for Ctrl+X
      const abortController = new AbortController();
      abortRef.current = abortController;

      let fullText = "";
      const completedCalls: import("../types/index.js").ToolCall[] = [];
      const finalSegments: MessageSegment[] = [];

      // Track subagent token usage and aggregate into the main total
      const subagentCumulative = new Map<string, { input: number; output: number }>();
      const completedResultChars = new Map<string, number>();

      // All values in chars for consistent units with ContextBar (divides by CHARS_PER_TOKEN)
      const updateSubagentChars = () => {
        let total = 0;
        for (const chars of completedResultChars.values()) total += chars;
        for (const [id, stats] of subagentCumulative) {
          if (!completedResultChars.has(id)) total += stats.output * 4;
        }
        useStatusBarStore.getState().setSubagentChars(total);
      };

      const unsubAgentStats = onAgentStats((event) => {
        const prev = subagentCumulative.get(event.agentId) ?? { input: 0, output: 0 };
        const deltaIn = event.tokenUsage.input - prev.input;
        const deltaOut = event.tokenUsage.output - prev.output;
        subagentCumulative.set(event.agentId, {
          input: event.tokenUsage.input,
          output: event.tokenUsage.output,
        });
        if (deltaIn > 0 || deltaOut > 0) {
          const base = baseTokenUsageRef.current;
          const newUsage: TokenUsage = {
            ...base,
            prompt: base.prompt + deltaIn,
            completion: base.completion + deltaOut,
            total: base.total + deltaIn + deltaOut,
            subagentInput: base.subagentInput + deltaIn,
            subagentOutput: base.subagentOutput + deltaOut,
          };
          pendingTokenUsage.current = newUsage;
          baseTokenUsageRef.current = newUsage;
          updateSubagentChars();
          queueMicrotaskFlush();
        }
      });

      const unsubMultiAgent = onMultiAgentEvent((event) => {
        if (event.type === "agent-done" && event.agentId) {
          completedResultChars.set(event.agentId, event.resultChars ?? 0);
          updateSubagentChars();
        }
        if (event.type === "dispatch-done") {
          completedResultChars.clear();
          subagentCumulative.clear();
          useStatusBarStore.getState().setSubagentChars(0);
        }
      });

      try {
        const taskType = detectTaskType(input);
        const modelId = resolveTaskModel(
          taskType,
          effectiveConfig.taskRouter,
          activeModelRef.current,
        );
        const model = resolveModel(modelId);

        // Resolve subagent models from task router
        const tr = effectiveConfig.taskRouter;
        const explorationModelId = tr?.exploration ?? undefined;
        const codingModelId = tr?.coding ?? undefined;
        const webSearchModelId = tr?.webSearch ?? undefined;
        const subagentModels =
          explorationModelId || codingModelId
            ? {
                exploration: explorationModelId ? resolveModel(explorationModelId) : undefined,
                coding: codingModelId ? resolveModel(codingModelId) : undefined,
              }
            : undefined;
        const webSearchModel = webSearchModelId ? resolveModel(webSearchModelId) : undefined;
        webSearchModelLabelRef.current = webSearchModelId
          ? getShortModelLabel(webSearchModelId)
          : null;

        // Web search approval — only gate when webSearch is enabled (default true)
        const webSearchApproval =
          effectiveConfig.webSearch !== false
            ? interactiveCallbacks.onWebSearchApproval
            : undefined;

        // Build Anthropic-specific providerOptions (thinking, effort, context management)
        const { providerOptions, headers } = buildProviderOptions(
          modelId,
          effectiveConfig,
          taskType,
        );

        const agent = planModeRef.current
          ? new ToolLoopAgent({
              id: "forge-plan",
              model,
              tools: {
                ...buildPlanModeTools(cwd, effectiveConfig.editorIntegration, webSearchApproval, {
                  webSearchModel,
                  sessionId: sessionIdRef.current,
                }),
                dispatch: buildSubagentTools({
                  defaultModel: model,
                  webSearchModel,
                  providerOptions,
                  headers,
                  onApproveWebSearch: webSearchApproval,
                  repoMapContext: contextManager.isRepoMapReady()
                    ? contextManager.renderRepoMap() || undefined
                    : undefined,
                  sharedCacheRef: sharedCacheRef.current,
                }).dispatch,
                ...(interactiveCallbacks
                  ? buildInteractiveTools(interactiveCallbacks, {
                      cwd,
                      sessionId: sessionIdRef.current,
                    })
                  : {}),
              },
              instructions: contextManager.buildSystemPrompt(),
              stopWhen: stepCountIs(50),
              ...(providerOptions && Object.keys(providerOptions).length > 0
                ? { providerOptions }
                : {}),
              ...(headers ? { headers } : {}),
            })
          : createForgeAgent({
              model,
              contextManager,
              forgeMode: contextManager.getForgeMode(),
              interactive: interactiveCallbacks,
              editorIntegration: effectiveConfig.editorIntegration,
              subagentModels,
              webSearchModel,
              onApproveWebSearch: webSearchApproval,
              providerOptions,
              headers,
              codeExecution: effectiveConfig.codeExecution,
              cwd,
              sessionId: sessionIdRef.current,
              sharedCacheRef: sharedCacheRef.current,
            });
        let result!: StreamTextResult<ToolSet, never>;
        const MAX_TRANSIENT_RETRIES = 3;
        for (let retry = 0; retry <= MAX_TRANSIENT_RETRIES; retry++) {
          if (abortController.signal.aborted) break;
          try {
            for (let degradeLevel = 0; degradeLevel <= 2; degradeLevel++) {
              if (abortController.signal.aborted) break;
              try {
                const currentAgent =
                  degradeLevel === 0
                    ? agent
                    : (() => {
                        const degraded = degradeProviderOptions(
                          activeModelRef.current,
                          degradeLevel,
                        );
                        return planModeRef.current
                          ? new ToolLoopAgent({
                              id: "forge-plan",
                              model,
                              tools: {
                                ...buildPlanModeTools(
                                  cwd,
                                  effectiveConfig.editorIntegration,
                                  webSearchApproval,
                                  { sessionId: sessionIdRef.current },
                                ),
                                dispatch: buildSubagentTools({
                                  defaultModel: model,
                                  repoMapContext: contextManager.isRepoMapReady()
                                    ? contextManager.renderRepoMap() || undefined
                                    : undefined,
                                  sharedCacheRef: sharedCacheRef.current,
                                }).dispatch,
                                ...(interactiveCallbacks
                                  ? buildInteractiveTools(interactiveCallbacks, {
                                      cwd,
                                      sessionId: sessionIdRef.current,
                                    })
                                  : {}),
                              },
                              instructions: contextManager.buildSystemPrompt(),
                              stopWhen: stepCountIs(50),
                              ...(Object.keys(degraded.providerOptions).length > 0
                                ? { providerOptions: degraded.providerOptions }
                                : {}),
                              ...(degraded.headers ? { headers: degraded.headers } : {}),
                            })
                          : createForgeAgent({
                              model,
                              contextManager,
                              forgeMode: contextManager.getForgeMode(),
                              interactive: interactiveCallbacks,
                              editorIntegration: effectiveConfig.editorIntegration,
                              subagentModels,
                              onApproveWebSearch: webSearchApproval,
                              providerOptions: degraded.providerOptions,
                              headers: degraded.headers,
                              codeExecution: effectiveConfig.codeExecution,
                              cwd,
                              sessionId: sessionIdRef.current,
                            });
                      })();
                result = (await currentAgent.stream({
                  messages: newCoreMessages,
                  abortSignal: abortController.signal,
                })) as unknown as StreamTextResult<ToolSet, never>;
                break;
              } catch (err: unknown) {
                if (!isProviderOptionsError(err) || degradeLevel === 2) throw err;
              }
            }
            break;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const isTransient =
              /overloaded|529|rate.?limit|too many requests|503|502|timeout/i.test(msg);
            if (!isTransient || retry === MAX_TRANSIENT_RETRIES || abortController.signal.aborted) {
              throw err;
            }
            const delay = 1000 * 2 ** retry + Math.random() * 500;
            const delaySec = Math.round(delay / 1000);
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "system",
                content: `Retry ${String(retry + 1)}/${String(MAX_TRANSIENT_RETRIES)}: ${msg} [delay:${String(delaySec)}s]`,
                timestamp: Date.now(),
              },
            ]);
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        const toolCallArgs = new Map<string, string>();
        const thinkingParser = createThinkingParser();
        let hasNativeReasoning = false;
        let thinkingIdCounter = 0;
        const streamErrors: string[] = [];

        const buf = streamSegmentsBuffer.current;
        const tcBuf = liveToolCallsBuffer.current;

        const updateStreamingEstimate = (newChars: number) => {
          streamingCharsRef.current += newChars;
          const estimatedNewTokens = Math.round(streamingCharsRef.current / 4);
          const base = baseTokenUsageRef.current;
          pendingTokenUsage.current = {
            ...base,
            completion: base.completion + estimatedNewTokens,
            total: base.total + estimatedNewTokens,
          };
          pendingLastStepOutput.current = estimatedNewTokens;
        };

        const appendText = (text: string) => {
          fullText += text;
          updateStreamingEstimate(text.length);
          segmentsDirty.current = true;
          const lastSeg = finalSegments[finalSegments.length - 1];
          if (lastSeg?.type === "text") {
            lastSeg.content += text;
          } else {
            finalSegments.push({ type: "text", content: text });
          }
          const lastBuf = buf[buf.length - 1];
          if (lastBuf?.type === "text") {
            lastBuf.content += text;
          } else {
            buf.push({ type: "text" as const, content: text });
          }
        };

        const pushReasoningSegment = (id: string) => {
          segmentsDirty.current = true;
          finalSegments.push({ type: "reasoning", content: "", id });
          buf.push({ type: "reasoning", content: "", id, done: false } as StreamSegment);
        };

        const appendReasoningContent = (text: string) => {
          updateStreamingEstimate(text.length);
          segmentsDirty.current = true;
          const lastSeg = finalSegments[finalSegments.length - 1];
          if (lastSeg?.type === "reasoning") {
            lastSeg.content += text;
          }
          const lastBuf = buf[buf.length - 1];
          if (lastBuf?.type === "reasoning") {
            lastBuf.content += text;
          }
        };

        const markReasoningDone = () => {
          const lastBuf = buf[buf.length - 1];
          if (lastBuf?.type === "reasoning" && !lastBuf.done) {
            segmentsDirty.current = true;
            lastBuf.done = true;
          }
        };

        flushTimerRef.current = setInterval(flushStreamState, 200);

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "reasoning-start": {
              hasNativeReasoning = true;
              pushReasoningSegment(part.id);
              break;
            }
            case "reasoning-delta": {
              appendReasoningContent(part.text);
              break;
            }
            case "reasoning-end":
              markReasoningDone();
              break;
            case "text-delta": {
              if (hasNativeReasoning) {
                appendText(part.text);
              } else {
                const parsed = thinkingParser.feed(part.text);
                for (const chunk of parsed) {
                  switch (chunk.type) {
                    case "text":
                      appendText(chunk.content);
                      break;
                    case "reasoning-start":
                      pushReasoningSegment(`thinking-${String(thinkingIdCounter++)}`);
                      break;
                    case "reasoning-content":
                      appendReasoningContent(chunk.content);
                      break;
                    case "reasoning-end":
                      markReasoningDone();
                      break;
                  }
                }
              }
              break;
            }
            case "tool-input-start": {
              segmentsDirty.current = true;
              toolCallsDirty.current = true;
              const lastToolSeg = finalSegments[finalSegments.length - 1];
              if (lastToolSeg?.type === "tools") {
                lastToolSeg.toolCallIds.push(part.id);
              } else {
                finalSegments.push({ type: "tools", toolCallIds: [part.id] });
              }
              tcBuf.push({
                id: part.id,
                toolName: part.toolName,
                state: "running",
                ...(part.toolName === "web_search" && webSearchModelLabelRef.current
                  ? { backend: webSearchModelLabelRef.current }
                  : {}),
              });
              const lastBufSeg = buf[buf.length - 1];
              if (lastBufSeg?.type === "tools") {
                lastBufSeg.callIds.push(part.id);
              } else {
                buf.push({ type: "tools" as const, callIds: [part.id] });
              }
              toolCallArgs.set(part.id, "");
              queueMicrotaskFlush();
              break;
            }
            case "tool-input-delta": {
              toolCallsDirty.current = true;
              toolCallArgs.set(part.id, (toolCallArgs.get(part.id) ?? "") + part.delta);
              const tc = tcBuf.find((c) => c.id === part.id);
              if (tc) tc.args = toolCallArgs.get(part.id);
              toolCharsRef.current += part.delta.length;
              break;
            }
            case "tool-result": {
              toolCallsDirty.current = true;
              const resultStr =
                typeof part.output === "string" ? part.output : JSON.stringify(part.output);
              const tc = tcBuf.find((c) => c.id === part.toolCallId);
              if (tc) {
                tc.state = "done";
                tc.result = resultStr;
              }
              toolCharsRef.current += resultStr.length;
              completedCalls.push({
                id: part.toolCallId,
                name: part.toolName,
                args: safeParseArgs(toolCallArgs.get(part.toolCallId)),
                result: { success: true, output: resultStr },
              });
              queueMicrotaskFlush();
              break;
            }
            case "tool-error": {
              toolCallsDirty.current = true;
              const tc = tcBuf.find((c) => c.id === part.toolCallId);
              if (tc) {
                tc.state = "error";
                tc.error = String(part.error);
              }
              completedCalls.push({
                id: part.toolCallId,
                name: part.toolName,
                args: safeParseArgs(toolCallArgs.get(part.toolCallId)),
                result: { success: false, output: "", error: String(part.error) },
              });
              queueMicrotaskFlush();
              break;
            }
            case "finish-step": {
              const stepIn = part.usage.inputTokens ?? 0;
              const stepOut = part.usage.outputTokens ?? 0;
              const stepCache =
                (
                  part.usage as {
                    inputTokenDetails?: { cacheReadTokens?: number };
                  }
                ).inputTokenDetails?.cacheReadTokens ?? 0;
              const base = baseTokenUsageRef.current;
              const newUsage: TokenUsage = {
                ...base,
                prompt: base.prompt + stepIn,
                completion: base.completion + stepOut,
                total: base.total + stepIn + stepOut,
                cacheRead: base.cacheRead + stepCache,
              };
              pendingTokenUsage.current = newUsage;
              baseTokenUsageRef.current = newUsage;
              streamingCharsRef.current = 0;
              if (stepIn > 0) pendingContextTokens.current = stepIn;
              pendingLastStepOutput.current = stepOut;
              break;
            }
            case "error": {
              const err = part.error;
              const errText =
                (err instanceof Error ? err.message : null) ||
                (typeof err === "string" ? err : null) ||
                JSON.stringify(err);
              const errStack = err instanceof Error ? err.stack : undefined;
              appendText(`\n\n_Error: ${errText}_`);
              streamErrors.push(
                errStack ? `Error: ${errText}\n\n${errStack}` : `Error: ${errText}`,
              );
              break;
            }
          }
        }

        if (flushTimerRef.current) {
          clearInterval(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        flushStreamState();

        if (!hasNativeReasoning) {
          for (const chunk of thinkingParser.flush()) {
            switch (chunk.type) {
              case "text":
                appendText(chunk.content);
                break;
              case "reasoning-content":
                appendReasoningContent(chunk.content);
                break;
              default:
                break;
            }
          }
        }

        let responseMessages: ModelMessage[];
        try {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("response timeout")), 10_000),
          );
          const responseData = await Promise.race([result.response, timeout]);
          responseMessages = responseData.messages;
        } catch {
          responseMessages =
            fullText.length > 0 ? [{ role: "assistant" as const, content: fullText }] : [];
        }

        // Embed plan as a segment if one was created
        setActivePlan((currentPlan) => {
          if (currentPlan) {
            finalSegments.push({ type: "plan", plan: currentPlan });
          }
          return null;
        });

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
          toolCalls: completedCalls.length > 0 ? completedCalls : undefined,
          segments: finalSegments.length > 0 ? finalSegments : undefined,
        };

        const errorMsgs: ChatMessage[] = streamErrors.map((errContent) => ({
          id: crypto.randomUUID(),
          role: "system" as const,
          content: errContent,
          timestamp: Date.now(),
        }));

        let allMsgs: ChatMessage[] = [];
        setMessages((prev) => {
          allMsgs = [...prev, assistantMsg, ...errorMsgs];
          return allMsgs;
        });

        // Save session async — don't block React state updates
        queueMicrotask(() => {
          const snapshot = getWorkspaceSnapshot?.();
          if (snapshot) {
            const { meta, tabMessages } = buildSessionMeta({
              sessionId: sessionIdRef.current,
              title: SessionManager.deriveTitle(allMsgs),
              cwd,
              snapshot,
              currentTabMessages: allMsgs.filter((m) => m.role !== "system"),
              configOverrides: getConfigOverrides?.() ?? null,
            });
            sessionManager.saveSession(meta, tabMessages);
            sessionManager.saveSessionMemory(
              sessionIdRef.current,
              contextManager.getMemoryManager().exportSessionState(),
            );
          }
        });

        setCoreMessages((prev) => [...prev, ...responseMessages]);
        streamSegmentsBuffer.current = [];
        liveToolCallsBuffer.current = [];
        lastFlushedSegments.current = [];
        lastFlushedToolCalls.current = [];
        lastFlushedStreamingChars.current = 0;
        streamingCharsRef.current = 0;
        toolCharsRef.current = 0;
        setStreamingChars(0);
        setStreamSegments([]);
        setLiveToolCalls([]);
      } catch (err: unknown) {
        if (flushTimerRef.current) {
          clearInterval(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        const isAbort = abortController.signal.aborted;
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        if (fullText.trim().length > 0 || completedCalls.length > 0) {
          const partialMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullText,
            timestamp: Date.now(),
            toolCalls: completedCalls.length > 0 ? completedCalls : undefined,
            segments: finalSegments.length > 0 ? finalSegments : undefined,
          };
          setMessages((prev) => [...prev, partialMsg]);

          if (completedCalls.length > 0) {
            const assistantContent: Array<TextPart | ToolCallPart> = [];
            if (fullText.length > 0) {
              assistantContent.push({ type: "text", text: fullText });
            }
            for (const call of completedCalls) {
              assistantContent.push({
                type: "tool-call",
                toolCallId: call.id,
                toolName: call.name,
                input: call.args,
              });
            }
            const toolContent = completedCalls.map((call) => ({
              type: "tool-result" as const,
              toolCallId: call.id,
              toolName: call.name,
              output: { type: "text" as const, value: call.result?.output ?? "" },
            }));
            setCoreMessages((prev) => [
              ...prev,
              { role: "assistant" as const, content: assistantContent },
              { role: "tool" as const, content: toolContent },
            ]);
          } else {
            setCoreMessages((prev) => [...prev, { role: "assistant" as const, content: fullText }]);
          }
        }
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: isAbort
              ? "Generation interrupted."
              : errorStack
                ? `Error: ${errorMsg}\n\n${errorStack}`
                : `Error: ${errorMsg}`,
            timestamp: Date.now(),
          },
        ]);
        streamSegmentsBuffer.current = [];
        liveToolCallsBuffer.current = [];
        lastFlushedSegments.current = [];
        lastFlushedToolCalls.current = [];
        lastFlushedStreamingChars.current = 0;
        streamingCharsRef.current = 0;
        toolCharsRef.current = 0;
        setStreamingChars(0);
        setStreamSegments([]);
        setLiveToolCalls([]);
      } finally {
        unsubAgentStats();
        unsubMultiAgent();
        useStatusBarStore.getState().setSubagentChars(0);
        setIsLoading(false);
        abortRef.current = null;
        setPendingQuestion(null);
        setActivePlan(null);
        contextManager.invalidateFileTree();

        const postAction = planPostActionRef.current;
        if (postAction) {
          planPostActionRef.current = null;
          const pContent = postAction.planContent;

          planModeRef.current = false;
          planRequestRef.current = null;
          contextManager.setForgeMode("default");

          if (postAction.action === "cancel") {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "system",
                content: "Plan cancelled.",
                timestamp: Date.now(),
              },
            ]);
          } else if (postAction.action === "clear_execute" && pContent) {
            contextManager.resetConversationTracking();
            setCoreMessages([]);
            setMessages([
              {
                id: crypto.randomUUID(),
                role: "system",
                content: "Context cleared — executing plan with fresh context...",
                timestamp: Date.now(),
              },
            ]);
            setTokenUsage({ ...ZERO_USAGE });
            setTimeout(
              () =>
                handleSubmit(
                  `Execute the following plan step by step. Create a plan checklist and update steps as you go.\n\n${pContent}`,
                ),
              0,
            );
          } else if (postAction.action === "execute" && pContent) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "system",
                content: "Plan accepted — executing...",
                timestamp: Date.now(),
              },
            ]);
            setTimeout(
              () =>
                handleSubmit(
                  `Execute the following plan step by step. Create a plan checklist and update steps as you go.\n\n${pContent}`,
                ),
              0,
            );
          }
        } else {
          // Process message queue
          setMessageQueue((queue) => {
            if (queue.length > 0) {
              const [next, ...rest] = queue;
              if (next) {
                setTimeout(() => handleSubmit(next.content), 0);
              }
              return rest;
            }
            return queue;
          });
        }
      }
    },
    [
      contextManager,
      sessionManager,
      interactiveCallbacks,
      cwd,
      effectiveConfig,
      flushStreamState,
      queueMicrotaskFlush,
      getWorkspaceSnapshot,
      getConfigOverrides,
      setTokenUsage,
    ],
  );

  const pendingQuestionRef = useRef(pendingQuestion);
  pendingQuestionRef.current = pendingQuestion;

  const abort = useCallback(() => {
    if (abortRef.current) {
      const pq = pendingQuestionRef.current;
      if (pq) {
        pq.resolve("__skipped__");
        setPendingQuestion(null);
      }
      setActivePlan(null);
      abortRef.current.abort();
      abortRef.current = null;
      setIsLoading(false);
    }
  }, []);

  // Snapshot current state for tab switching
  const snapshot = useCallback(
    (label: string): TabState => ({
      id: sessionIdRef.current,
      label,
      messages,
      coreMessages,
      activeModel,
      activePlan,
      sidebarPlan,
      showPlanPanel,
      tokenUsage,
      coAuthorCommits,
      sessionId: sessionIdRef.current,
      planMode: planModeRef.current,
      planRequest: planRequestRef.current,
    }),
    [
      messages,
      coreMessages,
      activeModel,
      activePlan,
      sidebarPlan,
      showPlanPanel,
      tokenUsage,
      coAuthorCommits,
    ],
  );

  // Restore state from a tab snapshot
  const restore = useCallback(
    (state: TabState) => {
      setMessages(state.messages);
      setCoreMessages(state.coreMessages);
      setActiveModel(state.activeModel);
      setActivePlan(state.activePlan);
      setSidebarPlan(state.sidebarPlan);
      setShowPlanPanel(state.showPlanPanel);
      setTokenUsage(state.tokenUsage);
      setCoAuthorCommits(state.coAuthorCommits);
      sessionIdRef.current = state.sessionId;
      planModeRef.current = state.planMode;
      planRequestRef.current = state.planRequest;
      streamSegmentsBuffer.current = [];
      liveToolCallsBuffer.current = [];
      lastFlushedSegments.current = [];
      lastFlushedToolCalls.current = [];
      lastFlushedStreamingChars.current = 0;
      setStreamSegments([]);
      setLiveToolCalls([]);
      setPendingQuestion(null);
      setMessageQueue([]);
      setPendingPlanReview(null);
      setIsLoading(false);
      autoSummarizedRef.current = false;
      contextManager.resetConversationTracking();
    },
    [setTokenUsage, contextManager],
  );

  // Restore a session from disk (single-tab fallback)
  const restoreSession = useCallback(
    (sessionId: string) => {
      const data = sessionManager.loadSessionMessages(sessionId);
      if (!data) return;
      contextManager.resetConversationTracking();
      sessionIdRef.current = sessionId;
      setMessages(data.messages);
      setCoreMessages(data.coreMessages);
      streamSegmentsBuffer.current = [];
      liveToolCallsBuffer.current = [];
      lastFlushedSegments.current = [];
      lastFlushedToolCalls.current = [];
      lastFlushedStreamingChars.current = 0;
      setStreamSegments([]);
      setLiveToolCalls([]);
      setTokenUsage({ ...ZERO_USAGE });

      const memState = sessionManager.loadSessionMemory(sessionId) as {
        config: import("../core/memory/types.js").MemoryScopeConfig;
        memories: import("../core/memory/types.js").MemoryRecord[];
      } | null;
      if (memState?.config && memState.memories) {
        contextManager.getMemoryManager().importSessionState(memState);
      }
    },
    [sessionManager, setTokenUsage, contextManager],
  );

  const setPlanMode = useCallback((on: boolean) => {
    planModeRef.current = on;
  }, []);

  const setPlanRequest = useCallback((req: string | null) => {
    planRequestRef.current = req;
  }, []);

  return {
    messages,
    setMessages,
    coreMessages,
    setCoreMessages,
    isLoading,
    streamSegments,
    liveToolCalls,
    activePlan,
    setActivePlan,
    sidebarPlan,
    setSidebarPlan,
    showPlanPanel,
    setShowPlanPanel,
    pendingQuestion,
    setPendingQuestion,
    messageQueue,
    setMessageQueue,
    activeModel,
    setActiveModel,
    coAuthorCommits,
    setCoAuthorCommits,
    tokenUsage,
    setTokenUsage,
    contextTokens,
    lastStepOutput,
    chatChars,
    sessionId: sessionIdRef.current,
    planFile: planFileName(sessionIdRef.current),
    planMode: planModeRef.current,
    planRequest: planRequestRef.current,
    handleSubmit,
    summarizeConversation,
    abort,
    interactiveCallbacks,
    setPlanMode,
    setPlanRequest,
    pendingPlanReview,
    setPendingPlanReview,
    snapshot,
    restore,
    restoreSession,
    restoreFromTabState: restore,
  };
}
