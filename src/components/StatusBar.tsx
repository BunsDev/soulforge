import { TextAttributes } from "@opentui/core";
import { providerIcon, UI_ICONS } from "../core/icons.js";

interface Props {
  provider: string;
  model: string;
  cwd: string;
  messageCount: number;
}

export function StatusBar({ provider, model, cwd, messageCount }: Props) {
  return (
    <box flexDirection="row" justifyContent="space-between" paddingX={1} height={1} width="100%">
      <box gap={1} flexDirection="row">
        <text bg="#6A0DAD" fg="white" attributes={TextAttributes.BOLD} truncate>
          {` ${providerIcon(provider)} ${provider.toUpperCase()} `}
        </text>
        <text fg="#555">{UI_ICONS.brain}</text>
        <text fg="#666" truncate>
          {model}
        </text>
      </box>
      <box gap={1} flexDirection="row">
        <text fg="#555">{UI_ICONS.folder}</text>
        <text fg="#444" truncate>
          {cwd}
        </text>
        <text fg="#333">│</text>
        <text fg="#DC143C">
          {messageCount >= 1000 ? `${(messageCount / 1000).toFixed(1)}k` : String(messageCount)}{" "}
          msgs
        </text>
      </box>
    </box>
  );
}
