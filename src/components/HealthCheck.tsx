import { Box, Text } from "ink";
import { providerIcon } from "../core/icons.js";
import { checkProviders } from "../core/llm/provider.js";
import { detectInstalledFonts } from "../core/setup/install.js";
import { checkPrerequisites } from "../core/setup/prerequisites.js";

const W = 52;
const L = 24;
const R = 25;

const H = "─";
const V = "│";

function hLine(left: string, mid: string | null, right: string): string {
  if (mid) {
    return `${left}${H.repeat(L)}${mid}${H.repeat(R)}${right}`;
  }
  return `${left}${H.repeat(W - 2)}${right}`;
}

function hFull(left: string, right: string): string {
  return `${left}${H.repeat(W - 2)}${right}`;
}

export function HealthCheck() {
  const provs = checkProviders();
  const prereqs = checkPrerequisites();
  const fonts = detectInstalledFonts();
  const rows = Math.max(provs.length, prereqs.length);

  return (
    <Box flexDirection="column" width={W}>
      {/* Top border + title */}
      <Text color="#333">{`┌${H.repeat(W - 2)}┐`}</Text>
      <Box>
        <Text color="#333">{V}</Text>
        <Text color="#555" bold>
          {" 󱁤 Health Check".padEnd(W - 2)}
        </Text>
        <Text color="#333">{V}</Text>
      </Box>

      {/* Providers / Tools header */}
      <Text color="#333">{hLine("├", "┬", "┤")}</Text>
      <Box>
        <Text color="#333">{V}</Text>
        <Text color="#6A0DAD" bold>
          {" 󰚩 Providers".padEnd(L)}
        </Text>
        <Text color="#333">{V}</Text>
        <Text color="#6A0DAD" bold>
          {" 󰠭 Tools".padEnd(R)}
        </Text>
        <Text color="#333">{V}</Text>
      </Box>
      <Text color="#333">{hLine("├", "┼", "┤")}</Text>

      {/* Provider + Tool rows */}
      {Array.from({ length: rows }, (_, i) => {
        const p = provs[i];
        const t = prereqs[i];

        const pCell = p ? ` ${p.available ? "✓" : "✗"} ${providerIcon(p.id)} ${p.name}` : "";
        const pColor = p ? (p.available ? "#2d5" : "#555") : "#333";

        const tCell = t
          ? ` ${t.installed ? "✓" : t.prerequisite.required ? "✗" : "○"} ${t.prerequisite.name}`
          : "";
        const tColor = t
          ? t.installed
            ? "#2d5"
            : t.prerequisite.required
              ? "#f44"
              : "#FF8C00"
          : "#333";

        return (
          <Box key={`hc-${String(i)}`}>
            <Text color="#333">{V}</Text>
            <Text color={pColor}>{pCell.padEnd(L)}</Text>
            <Text color="#333">{V}</Text>
            <Text color={tColor}>{tCell.padEnd(R)}</Text>
            <Text color="#333">{V}</Text>
          </Box>
        );
      })}

      {/* Font section */}
      <Text color="#333">{hFull("├", "┤")}</Text>
      <Box>
        <Text color="#333">{V}</Text>
        <Text color="#6A0DAD" bold>
          {"  Fonts".padEnd(W - 2)}
        </Text>
        <Text color="#333">{V}</Text>
      </Box>
      <Text color="#333">{hFull("├", "┤")}</Text>
      {fonts.length > 0 ? (
        fonts.map((f) => (
          <Box key={f.id}>
            <Text color="#333">{V}</Text>
            <Text color="#2d5">{` ✓ ${f.family}`.padEnd(W - 2)}</Text>
            <Text color="#333">{V}</Text>
          </Box>
        ))
      ) : (
        <Box>
          <Text color="#333">{V}</Text>
          <Text color="#FF8C00">{" ○ No nerd font found".padEnd(W - 2)}</Text>
          <Text color="#333">{V}</Text>
        </Box>
      )}

      {/* Bottom */}
      <Text color="#333">{`└${H.repeat(W - 2)}┘`}</Text>
      <Box justifyContent="center">
        <Text color="#333" dimColor>
          /setup to install missing
        </Text>
      </Box>
    </Box>
  );
}
