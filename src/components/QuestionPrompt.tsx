import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { icon } from "../core/icons.js";
import type { PendingQuestion } from "../types/index.js";

interface Props {
  question: PendingQuestion;
  isActive: boolean;
}

export function QuestionPrompt({ question, isActive }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  useKeyboard((evt) => {
    if (!isActive) return;
    if (evt.name === "up") {
      setSelectedIdx((prev) => (prev > 0 ? prev - 1 : question.options.length - 1));
      return;
    }
    if (evt.name === "down") {
      setSelectedIdx((prev) => (prev + 1) % question.options.length);
      return;
    }
    if (evt.name === "return") {
      const selected = question.options[selectedIdx];
      if (selected) {
        question.resolve(selected.value);
      }
      return;
    }
    if (evt.name === "escape" && question.allowSkip) {
      question.resolve("__skipped__");
    }
  });

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      border={true}
      borderColor="#FF8C00"
      paddingX={1}
      width="100%"
    >
      <box>
        <text fg="#FF8C00" attributes={TextAttributes.BOLD}>
          {icon("question")} Question
        </text>
      </box>
      <box>
        <text fg="#eee">{question.question}</text>
      </box>
      {question.options.map((opt, i) => {
        const isSelected = i === selectedIdx;
        return (
          <box key={opt.value} gap={1} flexDirection="row">
            <text fg={isSelected ? "#FF8C00" : "#555"}>{isSelected ? " ›" : "  "}</text>
            <text
              fg={isSelected ? "#FF8C00" : "#ccc"}
              attributes={isSelected ? TextAttributes.BOLD : undefined}
            >
              {opt.label}
            </text>
            {opt.description && <text fg={isSelected ? "#999" : "#555"}>{opt.description}</text>}
          </box>
        );
      })}
      <box>
        <text fg="#555">
          ↑↓ select{"  "}⏎ confirm{question.allowSkip ? "  esc skip" : ""}
        </text>
      </box>
    </box>
  );
}
