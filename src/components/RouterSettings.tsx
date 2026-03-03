import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { TaskRouter } from "../types/index.js";
import { POPUP_BG, POPUP_HL, PopupRow } from "./shared.js";

const POPUP_WIDTH = 60;
const innerW = POPUP_WIDTH - 2;

interface SlotItem {
  key: keyof TaskRouter;
  label: string;
  desc: string;
}

const SLOTS: SlotItem[] = [
  { key: "planning", label: "Planning", desc: "[PLAN MODE] & plan tool" },
  { key: "coding", label: "Coding", desc: "code subagent" },
  { key: "exploration", label: "Exploration", desc: "explore subagent" },
  { key: "default", label: "Default", desc: "everything else" },
];

interface Props {
  visible: boolean;
  router: TaskRouter | undefined;
  activeModel: string;
  onPickSlot: (slot: keyof TaskRouter) => void;
  onClearSlot: (slot: keyof TaskRouter) => void;
  onClose: () => void;
}

export function RouterSettings({
  visible,
  router,
  activeModel,
  onPickSlot,
  onClearSlot,
  onClose,
}: Props) {
  const [cursor, setCursor] = useState(0);

  useInput(
    (input, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow) {
        setCursor((c) => (c > 0 ? c - 1 : SLOTS.length - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => (c < SLOTS.length - 1 ? c + 1 : 0));
        return;
      }
      if (key.return) {
        const slot = SLOTS[cursor];
        if (slot) onPickSlot(slot.key);
        return;
      }
      if (input === "d" || key.delete || key.backspace) {
        const slot = SLOTS[cursor];
        if (slot) onClearSlot(slot.key);
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
          <Text backgroundColor={POPUP_BG} color="#9B30FF" bold>
            󰓹
          </Text>
          <Text backgroundColor={POPUP_BG} color="white" bold>
            {" "}
            Task Router
          </Text>
        </PopupRow>

        {/* Separator */}
        <PopupRow w={innerW}>
          <Text backgroundColor={POPUP_BG} color="#333">
            {"─".repeat(innerW - 2)}
          </Text>
        </PopupRow>

        {/* Slot items */}
        {SLOTS.map((slot, i) => {
          const isSelected = i === cursor;
          const bg = isSelected ? POPUP_HL : POPUP_BG;
          const modelId = router?.[slot.key] ?? null;
          const displayModel = modelId ?? `(${activeModel})`;
          const isDefault = !modelId;
          return (
            <PopupRow key={slot.key} bg={bg} w={innerW}>
              <Text backgroundColor={bg} color={isSelected ? "#FF0040" : "#555"}>
                {isSelected ? "› " : "  "}
              </Text>
              <Text backgroundColor={bg} color={isSelected ? "white" : "#aaa"} bold={isSelected}>
                {slot.label.padEnd(14)}
              </Text>
              <Text backgroundColor={bg} color={isDefault ? "#555" : "#2d5"}>
                {displayModel.length > 28 ? `${displayModel.slice(0, 25)}...` : displayModel}
              </Text>
            </PopupRow>
          );
        })}

        {/* Spacer */}
        <PopupRow w={innerW}>
          <Text backgroundColor={POPUP_BG}>{""}</Text>
        </PopupRow>

        {/* Description */}
        <PopupRow w={innerW}>
          <Text backgroundColor={POPUP_BG} color="#555">
            {SLOTS[cursor]?.desc ?? ""}
          </Text>
        </PopupRow>

        {/* Spacer */}
        <PopupRow w={innerW}>
          <Text backgroundColor={POPUP_BG}>{""}</Text>
        </PopupRow>

        {/* Hints */}
        <PopupRow w={innerW}>
          <Text backgroundColor={POPUP_BG} color="#555">
            {"↑↓"} navigate {"⏎"} pick model {"d"} clear to default esc close
          </Text>
        </PopupRow>
      </Box>
    </Box>
  );
}
