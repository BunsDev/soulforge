import { spawn } from "node:child_process";
import { platform } from "node:os";
import { Box, Text, useInput } from "ink";
import { useCallback, useState } from "react";
import {
  detectInstalledFonts,
  installFont,
  NERD_FONTS,
  type NerdFont,
} from "../core/setup/install.js";
import {
  checkPrerequisites,
  getInstallCommands,
  type PrerequisiteStatus,
} from "../core/setup/prerequisites.js";
import { POPUP_BG, POPUP_HL, PopupRow } from "./shared.js";

const POPUP_WIDTH = 64;

type Tab = "tools" | "fonts";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSystemMessage: (msg: string) => void;
}

export function SetupGuide({ visible, onClose, onSystemMessage }: Props) {
  const [statuses, setStatuses] = useState<PrerequisiteStatus[]>(() => checkPrerequisites());
  const [cursor, setCursor] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tools");
  const [fontCursor, setFontCursor] = useState(0);
  const [installedFonts, setInstalledFonts] = useState<NerdFont[]>(() => detectInstalledFonts());

  const os = platform();
  const osLabel = os === "darwin" ? "macOS" : os === "win32" ? "Windows" : "Linux";

  const refresh = useCallback(() => {
    setStatuses(checkPrerequisites());
    setInstalledFonts(detectInstalledFonts());
  }, []);

  const installSelected = useCallback(() => {
    const item = statuses[cursor];
    if (!item || item.installed) return;

    const cmds = getInstallCommands(item.prerequisite.name);
    const cmd = cmds.find((c) => !c.startsWith("#") && c.trim().length > 0);
    if (!cmd) {
      onSystemMessage(
        `No auto-install command for ${item.prerequisite.name}. Manual steps:\n${cmds.join("\n")}`,
      );
      return;
    }

    setInstalling(item.prerequisite.name);
    onSystemMessage(`Installing ${item.prerequisite.name}...`);

    const proc = spawn("sh", ["-c", cmd], { stdio: "pipe" });
    const chunks: string[] = [];
    proc.stdout.on("data", (d: Buffer) => chunks.push(d.toString()));
    proc.stderr.on("data", (d: Buffer) => chunks.push(d.toString()));
    proc.on("close", (code) => {
      setInstalling(null);
      if (code === 0) {
        onSystemMessage(`${item.prerequisite.name} installed successfully.`);
      } else {
        onSystemMessage(
          `Failed to install ${item.prerequisite.name}:\n${chunks.join("").slice(0, 200)}`,
        );
      }
      refresh();
    });
    proc.on("error", () => {
      setInstalling(null);
      onSystemMessage(`Failed to run install command. Try manually:\n${cmd}`);
    });
  }, [statuses, cursor, onSystemMessage, refresh]);

  const installSelectedFont = useCallback(() => {
    const font = NERD_FONTS[fontCursor];
    if (!font) return;
    const isInstalled = installedFonts.some((f) => f.id === font.id);
    if (isInstalled) return;

    setInstalling(font.name);
    onSystemMessage(`Installing ${font.name} Nerd Font...`);

    installFont(font.id)
      .then((family) => {
        setInstalling(null);
        onSystemMessage(`${font.name} installed! Set terminal font to "${family}"`);
        refresh();
      })
      .catch((err: unknown) => {
        setInstalling(null);
        const msg = err instanceof Error ? err.message : String(err);
        onSystemMessage(`Failed to install ${font.name}: ${msg}`);
      });
  }, [fontCursor, installedFonts, onSystemMessage, refresh]);

  useInput(
    (input, key) => {
      if (installing) return;

      if (key.escape) {
        onClose();
        return;
      }

      // Tab switching
      if (key.tab || input === "1" || input === "2") {
        if (key.tab) {
          setTab((t) => (t === "tools" ? "fonts" : "tools"));
        } else if (input === "1") {
          setTab("tools");
        } else {
          setTab("fonts");
        }
        return;
      }

      if (tab === "tools") {
        if (key.upArrow || input === "k") {
          setCursor((p) => (p > 0 ? p - 1 : statuses.length - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setCursor((p) => (p < statuses.length - 1 ? p + 1 : 0));
          return;
        }
        if (key.return || input === "i") {
          installSelected();
          return;
        }
        if (input === "r") {
          refresh();
          return;
        }
        if (input === "a") {
          const missing = statuses.filter((s) => !s.installed);
          if (missing.length === 0) return;
          const cmds: string[] = [];
          for (const s of missing) {
            const c = getInstallCommands(s.prerequisite.name).find(
              (l) => !l.startsWith("#") && l.trim().length > 0,
            );
            if (c) cmds.push(c);
          }
          if (cmds.length === 0) return;
          setInstalling("all");
          onSystemMessage(`Installing ${String(cmds.length)} prerequisites...`);
          const fullCmd = cmds.join(" && ");
          const proc = spawn("sh", ["-c", fullCmd], { stdio: "pipe" });
          proc.on("close", (code) => {
            setInstalling(null);
            onSystemMessage(
              code === 0
                ? "All prerequisites installed!"
                : "Some installs may have failed. Run /setup to check.",
            );
            refresh();
          });
          proc.on("error", () => {
            setInstalling(null);
            onSystemMessage("Failed to run install commands.");
          });
        }
      } else {
        // fonts tab
        if (key.upArrow || input === "k") {
          setFontCursor((p) => (p > 0 ? p - 1 : NERD_FONTS.length - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setFontCursor((p) => (p < NERD_FONTS.length - 1 ? p + 1 : 0));
          return;
        }
        if (key.return || input === "i") {
          installSelectedFont();
          return;
        }
        if (input === "r") {
          refresh();
        }
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

  const innerW = POPUP_WIDTH - 2;
  const allInstalled = statuses.every((s) => s.installed);
  const missingCount = statuses.filter((s) => !s.installed).length;

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
          <Text color="#9B30FF" bold backgroundColor={POPUP_BG}>
            󰊠
          </Text>
          <Text color="white" bold backgroundColor={POPUP_BG}>
            {" "}
            SoulForge Setup
          </Text>
          <Text color="#555" backgroundColor={POPUP_BG}>
            {"  "}
            {osLabel}
          </Text>
        </PopupRow>

        {/* Tabs */}
        <PopupRow w={innerW}>
          <Text
            color={tab === "tools" ? "#9B30FF" : "#555"}
            bold={tab === "tools"}
            backgroundColor={POPUP_BG}
          >
            [1] Tools
          </Text>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"  "}
          </Text>
          <Text
            color={tab === "fonts" ? "#9B30FF" : "#555"}
            bold={tab === "fonts"}
            backgroundColor={POPUP_BG}
          >
            [2] Fonts
          </Text>
        </PopupRow>

        <PopupRow w={innerW}>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </Text>
        </PopupRow>

        {tab === "tools" ? (
          <>
            {allInstalled ? (
              <PopupRow w={innerW}>
                <Text color="#2d5" backgroundColor={POPUP_BG}>
                  ✓ All prerequisites are installed!
                </Text>
              </PopupRow>
            ) : (
              <PopupRow w={innerW}>
                <Text color="#FF8C00" backgroundColor={POPUP_BG}>
                  {String(missingCount)} missing — select to install
                </Text>
              </PopupRow>
            )}

            <PopupRow w={innerW}>
              <Text>{""}</Text>
            </PopupRow>

            {/* Prerequisites list */}
            {statuses.map((s, i) => {
              const isActive = i === cursor;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              const icon = s.installed ? "✓" : s.prerequisite.required ? "✗" : "○";
              const iconColor = s.installed ? "#2d5" : s.prerequisite.required ? "#f44" : "#FF8C00";
              const nameColor = s.installed ? "#555" : isActive ? "#FF0040" : "#aaa";

              return (
                <PopupRow key={s.prerequisite.name} bg={bg} w={innerW}>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#333"}>
                    {isActive ? "› " : "  "}
                  </Text>
                  <Text backgroundColor={bg} color={iconColor}>
                    {icon}{" "}
                  </Text>
                  <Text backgroundColor={bg} color={nameColor} bold={isActive && !s.installed}>
                    {s.prerequisite.name.padEnd(28)}
                  </Text>
                  <Text backgroundColor={bg} color={s.installed ? "#333" : "#666"}>
                    {s.installed ? "installed" : s.prerequisite.required ? "required" : "optional"}
                  </Text>
                </PopupRow>
              );
            })}
          </>
        ) : (
          <>
            {/* Font selection */}
            <PopupRow w={innerW}>
              <Text color="#555" backgroundColor={POPUP_BG}>
                Select a Nerd Font to install:
              </Text>
            </PopupRow>

            <PopupRow w={innerW}>
              <Text>{""}</Text>
            </PopupRow>

            {NERD_FONTS.map((font, i) => {
              const isActive = i === fontCursor;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              const isInstalled = installedFonts.some((f) => f.id === font.id);
              const icon = isInstalled ? "✓" : "○";
              const iconColor = isInstalled ? "#2d5" : "#FF8C00";
              const nameColor = isInstalled ? "#555" : isActive ? "#FF0040" : "#aaa";

              return (
                <PopupRow key={font.id} bg={bg} w={innerW}>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#333"}>
                    {isActive ? "› " : "  "}
                  </Text>
                  <Text backgroundColor={bg} color={iconColor}>
                    {icon}{" "}
                  </Text>
                  <Text backgroundColor={bg} color={nameColor} bold={isActive && !isInstalled}>
                    {font.name.padEnd(20)}
                  </Text>
                  <Text backgroundColor={bg} color={isInstalled ? "#333" : "#666"}>
                    {isInstalled ? "installed" : font.description.slice(0, 26)}
                  </Text>
                </PopupRow>
              );
            })}

            <PopupRow w={innerW}>
              <Text>{""}</Text>
            </PopupRow>

            <PopupRow w={innerW}>
              <Text color="#555" backgroundColor={POPUP_BG}>
                After install, set terminal font to the name shown
              </Text>
            </PopupRow>
          </>
        )}

        <PopupRow w={innerW}>
          <Text>{""}</Text>
        </PopupRow>

        {/* Installing indicator */}
        {installing && (
          <PopupRow w={innerW}>
            <Text color="#9B30FF" backgroundColor={POPUP_BG}>
              ⠹ Installing {installing}...
            </Text>
          </PopupRow>
        )}

        {/* Hints */}
        <PopupRow w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            {"⏎"}/i install{"  "}
            {tab === "tools" ? "a install all  " : ""}r refresh{"  "}tab switch{"  "}esc close
          </Text>
        </PopupRow>
      </Box>
    </Box>
  );
}
