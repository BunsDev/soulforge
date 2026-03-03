import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { PendingQuestion } from "../types/index.js";

interface Props {
  question: PendingQuestion;
  isActive: boolean;
}

export function QuestionPrompt({ question, isActive }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setSelectedIdx((prev) => (prev > 0 ? prev - 1 : question.options.length - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIdx((prev) => (prev + 1) % question.options.length);
        return;
      }
      if (key.return) {
        const selected = question.options[selectedIdx];
        if (selected) {
          question.resolve(selected.value);
        }
        return;
      }
      if (key.escape && question.allowSkip) {
        question.resolve("__skipped__");
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#FF8C00" paddingX={1} width="100%">
      {/* Header */}
      <Box>
        <Text color="#FF8C00" bold>
          {"\uF059"} Question
        </Text>
      </Box>
      {/* Question text */}
      <Box>
        <Text color="#eee">{question.question}</Text>
      </Box>
      {/* Options */}
      {question.options.map((opt, i) => {
        const isSelected = i === selectedIdx;
        return (
          <Box key={opt.value} gap={1}>
            <Text color={isSelected ? "#FF8C00" : "#555"}>{isSelected ? " ›" : "  "}</Text>
            <Text color={isSelected ? "#FF8C00" : "#ccc"} bold={isSelected}>
              {opt.label}
            </Text>
            {opt.description && <Text color={isSelected ? "#999" : "#555"}>{opt.description}</Text>}
          </Box>
        );
      })}
      {/* Hints */}
      <Box>
        <Text color="#555">
          ↑↓ select{"  "}⏎ confirm{question.allowSkip ? "  esc skip" : ""}
        </Text>
      </Box>
    </Box>
  );
}
