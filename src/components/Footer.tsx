import { icon } from "../core/icons.js";

export function Footer() {
  return (
    <box flexDirection="row" justifyContent="center" paddingX={1} width="100%" gap={2}>
      <Shortcut k="^X" ic={icon("stop")} l="Stop" />
      <Shortcut k="^D" ic={icon("cog")} l="Mode" />
      <Shortcut k="^E" ic={icon("pencil")} l="Editor" />
      <Shortcut k="^G" ic={icon("git")} l="Git" />
      <Shortcut k="^L" ic={icon("brain_alt")} l="LLM" />
      <Shortcut k="^S" ic={icon("skills")} l="Skills" />
      <Shortcut k="⌥R" ic={icon("error")} l="Errors" />
      <Shortcut k="⌥T" ic={icon("tabs")} l="Tab" />
      <Shortcut k="^H" ic={icon("help")} l="Help" />
      <Shortcut k="^C" ic={icon("quit")} l="Quit" />
    </box>
  );
}

function Shortcut({ k, ic, l }: { k: string; ic: string; l: string }) {
  return (
    <text>
      <span fg="#FF0040">
        <b>{k}</b>
      </span>
      <span fg="#555">
        {" "}
        {ic} {l}
      </span>
    </text>
  );
}
