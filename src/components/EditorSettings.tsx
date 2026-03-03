import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { EditorIntegration } from "../types/index.js";
import { POPUP_BG, POPUP_HL, PopupRow } from "./shared.js";

const POPUP_WIDTH = 60;
const innerW = POPUP_WIDTH - 2;

interface ToggleItem {
  key: keyof EditorIntegration;
  label: string;
  desc: string;
}

const ITEMS: ToggleItem[] = [
  { key: "diagnostics", label: "LSP Diagnostics", desc: "errors & warnings from LSP" },
  { key: "symbols", label: "Document Symbols", desc: "functions, classes, variables" },
  { key: "hover", label: "Hover / Type Info", desc: "type info at cursor position" },
  { key: "references", label: "Find References", desc: "all usages of a symbol" },
  { key: "definition", label: "Go to Definition", desc: "jump to symbol definition" },
  { key: "codeActions", label: "Code Actions", desc: "quick fixes & refactorings" },
  { key: "rename", label: "LSP Rename", desc: "workspace-wide symbol rename" },
  { key: "lspStatus", label: "LSP Status", desc: "check attached LSP servers" },
  { key: "format", label: "LSP Format", desc: "format buffer via LSP" },
  { key: "editorContext", label: "Editor Context", desc: "file/cursor/selection in prompt" },
];

const ALL_ON: EditorIntegration = {
  diagnostics: true,
  symbols: true,
  hover: true,
  references: true,
  definition: true,
  codeActions: true,
  editorContext: true,
  rename: true,
  lspStatus: true,
  format: true,
};

const ALL_OFF: EditorIntegration = {
  diagnostics: false,
  symbols: false,
  hover: false,
  references: false,
  definition: false,
  codeActions: false,
  editorContext: false,
  rename: false,
  lspStatus: false,
  format: false,
};

interface Props {
  visible: boolean;
  settings: EditorIntegration | undefined;
  onUpdate: (settings: EditorIntegration) => void;
  onClose: () => void;
}

export function EditorSettings({ visible, settings, onUpdate, onClose }: Props) {
  const [cursor, setCursor] = useState(0);
  const current = settings ?? ALL_ON;

  useInput(
    (input, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow) {
        setCursor((c) => (c > 0 ? c - 1 : ITEMS.length - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => (c < ITEMS.length - 1 ? c + 1 : 0));
        return;
      }
      if (key.return || input === " ") {
        const item = ITEMS[cursor];
        if (item) {
          onUpdate({ ...current, [item.key]: !current[item.key] });
        }
        return;
      }
      if (input === "a") {
        onUpdate({ ...ALL_ON });
        return;
      }
      if (input === "n") {
        onUpdate({ ...ALL_OFF });
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
          <Text backgroundColor={POPUP_BG} color="#9B30FF" bold></Text>
          <Text backgroundColor={POPUP_BG} color="white" bold>
            {" "}
            Editor Integrations
          </Text>
        </PopupRow>

        {/* Separator */}
        <PopupRow w={innerW}>
          <Text backgroundColor={POPUP_BG} color="#333">
            {"─".repeat(innerW - 2)}
          </Text>
        </PopupRow>

        {/* Toggle items */}
        {ITEMS.map((item, i) => {
          const isSelected = i === cursor;
          const isEnabled = current[item.key];
          const bg = isSelected ? POPUP_HL : POPUP_BG;
          return (
            <PopupRow key={item.key} bg={bg} w={innerW}>
              <Text backgroundColor={bg} color={isSelected ? "#FF0040" : "#555"}>
                {isSelected ? "› " : "  "}
              </Text>
              <Text backgroundColor={bg} color={isEnabled ? "#2d5" : "#555"}>
                [{isEnabled ? "x" : " "}]
              </Text>
              <Text backgroundColor={bg} color={isEnabled ? "white" : "#666"}>
                {" "}
                {item.label.padEnd(20)}
              </Text>
              <Text backgroundColor={bg} color="#555">
                {item.desc}
              </Text>
            </PopupRow>
          );
        })}

        {/* Spacer */}
        <PopupRow w={innerW}>
          <Text backgroundColor={POPUP_BG}>{""}</Text>
        </PopupRow>

        {/* Hints */}
        <PopupRow w={innerW}>
          <Text backgroundColor={POPUP_BG} color="#555">
            {"↑↓"} navigate {"⏎"}/space toggle {"a"} all on {"n"} all off esc close
          </Text>
        </PopupRow>
      </Box>
    </Box>
  );
}
