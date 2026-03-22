import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { icon } from "../../core/icons.js";
import type { BackendProbeResult, HealthCheckResult } from "../../core/intelligence/router.js";
import { Overlay, POPUP_BG, PopupRow, useSpinnerFrame } from "../layout/shared.js";

const CHROME_ROWS = 6;
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface Props {
  visible: boolean;
  onClose: () => void;
  runHealthCheck: (
    onProgress: (partial: HealthCheckResult) => void,
  ) => Promise<HealthCheckResult | null>;
}

function statusBadge(
  br: BackendProbeResult,
  running: boolean,
  spinnerCh: string,
): { ch: string; color: string } {
  if (!br.supports) return { ch: "○", color: "#555" };
  if (br.initError) return { ch: "✗", color: "#FF0040" };
  if (br.probes.length === 0 && running) return { ch: spinnerCh, color: "#b87333" };
  const allPass =
    br.probes.length > 0 &&
    br.probes.every((p) => p.status === "pass" || p.status === "unsupported");
  if (allPass) return { ch: "●", color: "#2d5" };
  if (br.probes.some((p) => p.status === "pass")) return { ch: "◐", color: "#FF8C00" };
  if (br.probes.length === 0) return { ch: "◌", color: "#b87333" };
  return { ch: "✗", color: "#FF0040" };
}

interface Line {
  type: "header" | "probe" | "spacer" | "text";
  label?: string;
  desc?: string;
  color?: string;
  descColor?: string;
}

function buildLines(result: HealthCheckResult, running: boolean, spinnerCh: string): Line[] {
  const lines: Line[] = [];

  for (let bi = 0; bi < result.backends.length; bi++) {
    const br = result.backends[bi];
    if (!br) continue;
    const s = statusBadge(br, running, spinnerCh);

    if (bi > 0) lines.push({ type: "spacer" });

    lines.push({
      type: "header",
      label: `${s.ch} ${br.backend} (tier ${String(br.tier)})`,
      color: s.color,
    });

    if (!br.supports) {
      lines.push({ type: "text", label: "  does not support this language", color: "#555" });
    } else if (br.initError) {
      lines.push({
        type: "text",
        label: `  init failed: ${br.initError.slice(0, 50)}`,
        color: "#FF0040",
      });
    } else if (br.probes.length === 0) {
      lines.push({ type: "text", label: "  waiting…", color: "#555" });
    } else {
      for (const probe of br.probes) {
        const pIcon =
          probe.status === "pass"
            ? "✓"
            : probe.status === "empty"
              ? "○"
              : probe.status === "unsupported"
                ? "—"
                : probe.status === "timeout"
                  ? "⏱"
                  : "✗";
        const pColor =
          probe.status === "pass"
            ? "#2d5"
            : probe.status === "empty"
              ? "#FF8C00"
              : probe.status === "unsupported"
                ? "#555"
                : "#FF0040";
        const timing = probe.ms !== undefined ? ` ${String(probe.ms)}ms` : "";
        const desc =
          probe.status === "error"
            ? `${pIcon} ${(probe.error ?? "").slice(0, 30)}`
            : `${pIcon} ${probe.status}${timing}`;
        lines.push({
          type: "probe",
          label: probe.operation,
          desc,
          color: "#999",
          descColor: pColor,
        });
      }
    }
  }

  return lines;
}

export function DiagnosePopup({ visible, onClose, runHealthCheck }: Props) {
  const { width: termCols, height: termRows } = useTerminalDimensions();
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spinnerFrame = useSpinnerFrame();

  const popupWidth = Math.min(64, Math.floor(termCols * 0.8));
  const innerW = popupWidth - 2;
  const labelW = 28;
  const spinnerCh = SPINNER[spinnerFrame % SPINNER.length] ?? "⠋";
  const containerRows = termRows - 2;
  const maxVisible = Math.max(6, Math.floor(containerRows * 0.8) - CHROME_ROWS);

  const lines = result ? buildLines(result, running, spinnerCh) : [];

  const run = useCallback(() => {
    setRunning(true);
    setError(null);
    setResult(null);
    setScrollOffset(0);

    const timeout = setTimeout(() => {
      setRunning(false);
      setError("Health check timed out");
    }, 90_000);

    runHealthCheck((partial) => {
      setResult({ ...partial });
    })
      .then((final) => {
        clearTimeout(timeout);
        setRunning(false);
        if (final) setResult(final);
        else if (!error) setError("Intelligence router not initialized");
      })
      .catch((err) => {
        clearTimeout(timeout);
        setRunning(false);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [runHealthCheck, error]);

  useEffect(() => {
    if (visible) run();
  }, [visible, run]);

  useKeyboard((evt) => {
    if (!visible) return;
    if (evt.name === "escape") {
      onClose();
      return;
    }
    if (evt.name === "up") {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (evt.name === "down") {
      setScrollOffset((prev) => Math.min(Math.max(0, lines.length - maxVisible), prev + 1));
      return;
    }
    if (evt.name === "r") run();
  });

  if (!visible) return null;

  return (
    <Overlay>
      <box
        flexDirection="column"
        borderStyle="rounded"
        border={true}
        borderColor="#8B5CF6"
        width={popupWidth}
      >
        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg="#9B30FF">
            {icon("brain")}{" "}
          </text>
          <text bg={POPUP_BG} fg="white" attributes={TextAttributes.BOLD}>
            Health Check
          </text>
          {result ? (
            <text bg={POPUP_BG} fg="#555">
              {"  "}
              {result.language} · {result.probeFile.split("/").pop()}
            </text>
          ) : null}
          <text bg={POPUP_BG} fg="#555">
            {"  "}↑↓ scroll
          </text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg="#333">
            {"─".repeat(innerW - 2)}
          </text>
        </PopupRow>

        <box
          flexDirection="column"
          height={Math.min(Math.max(1, lines.length), maxVisible)}
          overflow="hidden"
        >
          {lines.length > 0 ? (
            lines.slice(scrollOffset, scrollOffset + maxVisible).map((line, vi) => {
              const key = String(vi + scrollOffset);
              switch (line.type) {
                case "header":
                  return (
                    <PopupRow key={key} w={innerW}>
                      <text
                        bg={POPUP_BG}
                        fg={line.color ?? "#8B5CF6"}
                        attributes={TextAttributes.BOLD}
                      >
                        {line.label ?? ""}
                      </text>
                    </PopupRow>
                  );
                case "probe":
                  return (
                    <PopupRow key={key} w={innerW}>
                      <text bg={POPUP_BG} fg={line.color ?? "#999"}>
                        {"  "}
                        {(line.label ?? "").padEnd(labelW).slice(0, labelW)}
                      </text>
                      <text bg={POPUP_BG} fg={line.descColor ?? "#666"}>
                        {line.desc ?? ""}
                      </text>
                    </PopupRow>
                  );
                case "text":
                  return (
                    <PopupRow key={key} w={innerW}>
                      <text bg={POPUP_BG} fg={line.color ?? "#555"}>
                        {line.label ?? ""}
                      </text>
                    </PopupRow>
                  );
                case "spacer":
                  return (
                    <PopupRow key={key} w={innerW}>
                      <text bg={POPUP_BG}>{""}</text>
                    </PopupRow>
                  );
                default:
                  return null;
              }
            })
          ) : (
            <PopupRow w={innerW}>
              <text bg={POPUP_BG} fg={error ? "#FF0040" : "#b87333"}>
                {error ?? `${spinnerCh} initializing…`}
              </text>
            </PopupRow>
          )}
        </box>

        {lines.length > maxVisible && (
          <PopupRow w={innerW}>
            <text fg="#555" bg={POPUP_BG}>
              {scrollOffset > 0 ? "↑ " : "  "}
              {scrollOffset + 1}-{Math.min(scrollOffset + maxVisible, lines.length)}/{lines.length}
              {scrollOffset + maxVisible < lines.length ? " ↓" : ""}
            </text>
          </PopupRow>
        )}

        <PopupRow w={innerW}>
          <text bg={POPUP_BG}>{""}</text>
        </PopupRow>

        <PopupRow w={innerW}>
          <text bg={POPUP_BG} fg="#555">
            ↑↓ scroll · r re-run · esc close
          </text>
        </PopupRow>
      </box>
    </Overlay>
  );
}
