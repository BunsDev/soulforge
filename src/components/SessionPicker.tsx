import { Box, Text, useInput } from "ink";
import { ScrollList } from "ink-scroll-list";
import { useCallback, useEffect, useState } from "react";
import { SessionManager, type SessionMeta } from "../core/sessions/manager.js";
import { POPUP_BG, POPUP_HL, PopupRow } from "./shared.js";

const POPUP_WIDTH = 80;
const MAX_VISIBLE = 14;

interface Props {
  visible: boolean;
  cwd: string;
  onClose: () => void;
  onRestore: (sessionId: string) => void;
  onSystemMessage: (msg: string) => void;
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

export function SessionPicker({ visible, cwd, onClose, onRestore, onSystemMessage }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [cursor, setCursor] = useState(0);
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const innerW = POPUP_WIDTH - 2;

  const manager = useCallback(() => new SessionManager(cwd), [cwd]);

  const refresh = useCallback(() => {
    setSessions(manager().listSessions());
  }, [manager]);

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      setQuery("");
      setCursor(0);
      setConfirmClear(false);
      refresh();
    }
  }, [visible, refresh]);

  const filterQuery = query.toLowerCase().trim();
  const filtered = filterQuery
    ? sessions.filter((s) => s.title.toLowerCase().includes(filterQuery))
    : sessions;

  useInput(
    (_input, key) => {
      // Confirm clear prompt
      if (confirmClear) {
        if (_input === "y" || _input === "Y") {
          const count = manager().clearAllSessions();
          onSystemMessage(`Cleared ${String(count)} session(s).`);
          setConfirmClear(false);
          refresh();
          setCursor(0);
          return;
        }
        setConfirmClear(false);
        return;
      }

      if (key.escape) {
        onClose();
        return;
      }

      // Navigation
      if (key.upArrow) {
        setCursor((prev) => (prev > 0 ? prev - 1 : Math.max(0, filtered.length - 1)));
        return;
      }
      if (key.downArrow) {
        setCursor((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        return;
      }

      // Enter — restore session
      if (key.return) {
        const session = filtered[cursor];
        if (session) {
          onRestore(session.id);
          onClose();
        }
        return;
      }

      // Delete — remove selected session
      if (key.delete || (_input === "d" && key.ctrl)) {
        const session = filtered[cursor];
        if (session) {
          manager().deleteSession(session.id);
          onSystemMessage(`Deleted session: ${session.title}`);
          refresh();
          setCursor((prev) => Math.min(prev, Math.max(0, filtered.length - 2)));
        }
        return;
      }

      // Ctrl+X — clear all sessions
      if (_input === "x" && key.ctrl) {
        if (sessions.length > 0) {
          setConfirmClear(true);
        }
        return;
      }

      // Backspace for filter
      if (key.backspace) {
        setQuery((prev) => prev.slice(0, -1));
        setCursor(0);
        return;
      }

      // Typing for filter
      if (_input && !key.ctrl && !key.meta) {
        setQuery((prev) => prev + _input);
        setCursor(0);
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

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
            {"\uF017"} Sessions
          </Text>
          <Text color="#555" backgroundColor={POPUP_BG}>
            {" "}
            ({String(sessions.length)})
          </Text>
        </PopupRow>

        {/* Search */}
        <PopupRow w={innerW}>
          <Text color="#9B30FF" backgroundColor={POPUP_BG}>
            {" "}
          </Text>
          <Text color={query ? "white" : "#555"} backgroundColor={POPUP_BG}>
            {query || "type to search sessions..."}
          </Text>
          <Text color="#FF0040" backgroundColor={POPUP_BG}>
            {"\u2588"}
          </Text>
        </PopupRow>

        {/* Separator */}
        <PopupRow w={innerW}>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"\u2500".repeat(innerW - 4)}
          </Text>
        </PopupRow>

        {/* Session list */}
        {filtered.length === 0 ? (
          <PopupRow w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              {query ? "no matching sessions" : "no sessions yet"}
            </Text>
          </PopupRow>
        ) : (
          <ScrollList selectedIndex={cursor} height={Math.min(filtered.length, MAX_VISIBLE)}>
            {filtered.map((session, i) => {
              const isActive = i === cursor;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              const title =
                session.title.length > 48 ? `${session.title.slice(0, 45)}...` : session.title;
              return (
                <PopupRow key={session.id} bg={bg} w={innerW}>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                    {isActive ? "\u203A " : "  "}
                  </Text>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#aaa"} bold={isActive}>
                    {title}
                  </Text>
                  <Text backgroundColor={bg} color="#555">
                    {"  "}
                    {String(session.messageCount)} msgs
                  </Text>
                  <Text backgroundColor={bg} color="#444">
                    {"  "}
                    {timeAgo(session.updatedAt)}
                  </Text>
                </PopupRow>
              );
            })}
          </ScrollList>
        )}

        {/* Confirm clear */}
        {confirmClear && (
          <PopupRow w={innerW}>
            <Text color="#FF0040" bold backgroundColor={POPUP_BG}>
              Delete all {String(sessions.length)} sessions? (y/n)
            </Text>
          </PopupRow>
        )}

        {/* Spacer */}
        <PopupRow w={innerW}>
          <Text>{""}</Text>
        </PopupRow>

        {/* Hints */}
        <PopupRow w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            {"\u2191\u2193"} nav {"\u23CE"} restore del delete ^X clear all esc close
          </Text>
        </PopupRow>
      </Box>
    </Box>
  );
}
