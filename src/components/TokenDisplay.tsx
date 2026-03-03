import { Text } from "ink";
import { useEffect, useRef, useState } from "react";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface Props {
  prompt: number;
  completion: number;
  total: number;
}

export function TokenDisplay({ prompt, completion, total }: Props) {
  const animPrompt = useAnimatedNumber(prompt);
  const animCompletion = useAnimatedNumber(completion);
  const animTotal = useAnimatedNumber(total);

  // Flash brighter when total just changed
  const [flash, setFlash] = useState(false);
  const prevTotal = useRef(total);
  useEffect(() => {
    if (total > prevTotal.current) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 600);
      prevTotal.current = total;
      return () => clearTimeout(timer);
    }
    prevTotal.current = total;
    return undefined;
  }, [total]);

  return (
    <Text>
      <Text color="#2d9bf0">{formatTokens(animPrompt)}</Text>
      <Text color="#555">↑ </Text>
      <Text color="#e0a020">{formatTokens(animCompletion)}</Text>
      <Text color="#555">↓ </Text>
      <Text color={flash ? "#fff" : "#888"} bold={flash}>
        {formatTokens(animTotal)}
      </Text>
    </Text>
  );
}
