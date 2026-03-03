import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

interface Props {
  onAccept: () => void;
  onRevise: (feedback: string) => void;
  onCancel: () => void;
  isActive: boolean;
}

export function PlanReviewPrompt({ onAccept, onRevise, onCancel, isActive }: Props) {
  const [value, setValue] = useState("");

  useInput(
    (_input, key) => {
      if (key.escape) {
        onCancel();
      }
    },
    { isActive },
  );

  const handleSubmit = (input: string) => {
    if (input.trim() === "") {
      onAccept();
    } else {
      onRevise(input.trim());
      setValue("");
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#00BFFF" paddingX={1} width="100%">
      <Box>
        <Text color="#00BFFF" bold>
          {"\uF0CB"} Plan written to .soulforge/plan.md
        </Text>
      </Box>
      <Box gap={1}>
        <Text color="#00BFFF">{"\u23CE"}</Text>
        <Text color="#ccc">accept</Text>
        <Text color="#555">{"\u2502"}</Text>
        <Text color="#FF0040">esc</Text>
        <Text color="#ccc">cancel</Text>
        <Text color="#555">{"\u2502"}</Text>
        <Text color="#555">type to revise</Text>
      </Box>
      <Box>
        <Text color="#00BFFF" bold>
          {">"}{" "}
        </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          focus={isActive}
          placeholder="feedback to revise plan..."
        />
      </Box>
    </Box>
  );
}
