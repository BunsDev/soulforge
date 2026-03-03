import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { getGitLog, gitPull, gitPush, gitStash, gitStashPop } from "../core/git/status.js";

import { POPUP_BG, POPUP_HL, PopupRow } from "./shared.js";

const POPUP_WIDTH = 46;

interface MenuItem {
  key: string;
  label: string;
  action: string;
}

const MENU_ITEMS: MenuItem[] = [
  { key: "c", label: "Commit", action: "commit" },
  { key: "p", label: "Push", action: "push" },
  { key: "u", label: "Pull", action: "pull" },
  { key: "s", label: "Stash", action: "stash" },
  { key: "o", label: "Stash Pop", action: "stash-pop" },
  { key: "l", label: "Log", action: "log" },
  { key: "g", label: "Lazygit", action: "lazygit" },
];

interface Props {
  visible: boolean;
  cwd: string;
  onClose: () => void;
  onCommit: () => void;
  onSuspend: (opts: { command: string; args?: string[] }) => void;
  onSystemMessage: (msg: string) => void;
  onRefresh: () => void;
}

export function GitMenu({
  visible,
  cwd,
  onClose,
  onCommit,
  onSuspend,
  onSystemMessage,
  onRefresh,
}: Props) {
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);

  const executeAction = async (action: string) => {
    switch (action) {
      case "commit":
        onClose();
        onCommit();
        return;

      case "push": {
        onClose();
        onSystemMessage("Pushing...");
        const pushResult = await gitPush(cwd);
        onSystemMessage(pushResult.ok ? "Push complete." : `Push failed: ${pushResult.output}`);
        onRefresh();
        return;
      }

      case "pull": {
        onClose();
        onSystemMessage("Pulling...");
        const pullResult = await gitPull(cwd);
        onSystemMessage(pullResult.ok ? "Pull complete." : `Pull failed: ${pullResult.output}`);
        onRefresh();
        return;
      }

      case "stash": {
        onClose();
        const stashResult = await gitStash(cwd);
        onSystemMessage(
          stashResult.ok ? "Changes stashed." : `Stash failed: ${stashResult.output}`,
        );
        onRefresh();
        return;
      }

      case "stash-pop": {
        onClose();
        const popResult = await gitStashPop(cwd);
        onSystemMessage(popResult.ok ? "Stash popped." : `Stash pop failed: ${popResult.output}`);
        onRefresh();
        return;
      }

      case "log": {
        onClose();
        const entries = await getGitLog(cwd, 20);
        if (entries.length === 0) {
          onSystemMessage("No commits found.");
        } else {
          const logText = entries.map((e) => `${e.hash} ${e.subject} (${e.date})`).join("\n");
          onSystemMessage(logText);
        }
        return;
      }

      case "lazygit": {
        onClose();
        try {
          onSuspend({ command: "lazygit" });
        } catch {
          onSystemMessage("Failed to launch lazygit. Is it installed?");
        }
        return;
      }
    }
  };

  useInput(
    (input, key) => {
      if (busy) return;

      if (key.escape) {
        onClose();
        return;
      }

      if (key.return) {
        const item = MENU_ITEMS[cursor];
        if (item) {
          setBusy(true);
          executeAction(item.action).finally(() => setBusy(false));
        }
        return;
      }

      if (key.upArrow || input === "k") {
        setCursor((prev) => (prev > 0 ? prev - 1 : MENU_ITEMS.length - 1));
        return;
      }

      if (key.downArrow || input === "j") {
        setCursor((prev) => (prev < MENU_ITEMS.length - 1 ? prev + 1 : 0));
        return;
      }

      // Single-key shortcuts
      const idx = MENU_ITEMS.findIndex((m) => m.key === input);
      if (idx >= 0) {
        setCursor(idx);
        setBusy(true);
        const item = MENU_ITEMS[idx];
        if (item) {
          executeAction(item.action).finally(() => setBusy(false));
        }
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

  const innerW = POPUP_WIDTH - 2;

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
            {"󰊢"} Git
          </Text>
        </PopupRow>

        {/* Separator */}
        <PopupRow w={innerW}>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </Text>
        </PopupRow>

        {/* Empty row */}
        <PopupRow w={innerW}>
          <Text>{""}</Text>
        </PopupRow>

        {/* Menu items */}
        {MENU_ITEMS.map((item, i) => {
          const isActive = i === cursor;
          const bg = isActive ? POPUP_HL : POPUP_BG;
          return (
            <PopupRow key={item.action} bg={bg} w={innerW}>
              <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                {isActive ? "› " : "  "}
              </Text>
              <Text backgroundColor={bg} color={isActive ? "#FF8C00" : "#666"} bold={isActive}>
                {item.key}
              </Text>
              <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#aaa"} bold={isActive}>
                {"  "}
                {item.label}
              </Text>
            </PopupRow>
          );
        })}

        {/* Empty row */}
        <PopupRow w={innerW}>
          <Text>{""}</Text>
        </PopupRow>

        {/* Hints */}
        <PopupRow w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            {"↑↓"} navigate {"⏎"}/key select esc close
          </Text>
        </PopupRow>
      </Box>
    </Box>
  );
}
