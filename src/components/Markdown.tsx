import { Box, Text } from "ink";
import { marked, type Token, type Tokens } from "marked";
import { createContext, useContext, useMemo } from "react";
import { highlightCode, TOKEN_COLORS } from "../core/highlight.js";

// ─── Code block collapse settings ───

const COLLAPSE_THRESHOLD = 8;
const PREVIEW_LINES = 4;

// Context to let a parent toggle all code blocks expanded/collapsed
const CodeExpandedContext = createContext(false);
export const CodeExpandedProvider = CodeExpandedContext.Provider;

// ─── Pseudo-heading: short capitalized line ending with colon ───

const PSEUDO_HEADING_RE = /^[A-Z][A-Za-z0-9 /&-]{0,55}:\s*$/;

// ─── Tokenize with streaming resilience ───

function tokenize(text: string): Token[] {
  try {
    return marked.lexer(text);
  } catch {
    // Fallback for malformed/partial markdown during streaming
    return [{ type: "paragraph", raw: text, text, tokens: [] } as Token];
  }
}

// Promote pseudo-headings (lines ending with `:`) from paragraphs to h3
function postProcessTokens(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (const token of tokens) {
    if (token.type === "paragraph" && PSEUDO_HEADING_RE.test(token.text)) {
      result.push({
        type: "heading",
        raw: token.raw,
        depth: 3,
        text: token.text.replace(/:\s*$/, ""),
        tokens: [
          {
            type: "text",
            raw: token.text.replace(/:\s*$/, ""),
            text: token.text.replace(/:\s*$/, ""),
          },
        ],
      } as Tokens.Heading);
    } else {
      result.push(token);
    }
  }
  return result;
}

// ─── Inline token renderer ───

function InlineTokens({ tokens, color }: { tokens: Token[]; color: string }) {
  return (
    <Text wrap="wrap">
      {tokens.map((tok, i) => {
        const key = `${tok.type}-${String(i)}`;
        switch (tok.type) {
          case "text": {
            const t = tok as Tokens.Text;
            // Text tokens can have sub-tokens (e.g. from list items)
            if (t.tokens && t.tokens.length > 0) {
              return <InlineTokens key={key} tokens={t.tokens} color={color} />;
            }
            return (
              <Text key={key} color={color}>
                {t.text}
              </Text>
            );
          }
          case "strong": {
            const t = tok as Tokens.Strong;
            return (
              <Text key={key} bold color={color}>
                <InlineTokens tokens={t.tokens} color={color} />
              </Text>
            );
          }
          case "em": {
            const t = tok as Tokens.Em;
            return (
              <Text key={key} italic color={color}>
                <InlineTokens tokens={t.tokens} color={color} />
              </Text>
            );
          }
          case "codespan": {
            const t = tok as Tokens.Codespan;
            return (
              <Text key={key} backgroundColor="#2a2a3e" color="#e8e8e8">
                {` ${t.text} `}
              </Text>
            );
          }
          case "del": {
            const t = tok as Tokens.Del;
            return (
              <Text key={key} strikethrough color="#888">
                <InlineTokens tokens={t.tokens} color="#888" />
              </Text>
            );
          }
          case "link": {
            const t = tok as Tokens.Link;
            return (
              <Text key={key}>
                <Text underline color={color}>
                  <InlineTokens tokens={t.tokens} color={color} />
                </Text>
                <Text dimColor> ({t.href})</Text>
              </Text>
            );
          }
          case "image": {
            const t = tok as Tokens.Image;
            return (
              <Text key={key} color="#888">
                [img: {t.text || t.href}]
              </Text>
            );
          }
          case "br":
            return <Text key={key}>{"\n"}</Text>;
          case "escape": {
            const t = tok as Tokens.Escape;
            return (
              <Text key={key} color={color}>
                {t.text}
              </Text>
            );
          }
          default:
            // Unknown inline token — render raw text if available
            return (
              <Text key={key} color={color}>
                {"text" in tok ? String(tok.text) : ""}
              </Text>
            );
        }
      })}
    </Text>
  );
}

// ─── Block renderers ───

function CodeBlock({
  content,
  lang,
  filename,
}: {
  content: string;
  lang: string;
  filename?: string;
}) {
  const globalExpanded = useContext(CodeExpandedContext);
  const highlighted = useMemo(() => highlightCode(content, lang), [content, lang]);
  const allLines = highlighted;
  const showLineNumbers = allLines.length > 1;
  const gutterWidth = showLineNumbers ? String(allLines.length).length + 1 : 0;

  const canCollapse = allLines.length > COLLAPSE_THRESHOLD;
  const isExpanded = globalExpanded || !canCollapse;
  const hiddenCount = canCollapse ? allLines.length - PREVIEW_LINES : 0;
  const visibleLines = isExpanded ? allLines : allLines.slice(0, PREVIEW_LINES);

  return (
    <Box flexDirection="column" marginY={0}>
      <Box height={1} flexShrink={0}>
        {filename ? (
          <Text color="#888" dimColor wrap="truncate">
            {"  "}
            {filename}
          </Text>
        ) : lang ? (
          <Text color="#888" dimColor wrap="truncate">
            {"  "}
            {lang}
          </Text>
        ) : (
          <Text color="#333" wrap="truncate">
            {"  "}code
          </Text>
        )}
        {canCollapse && (
          <Text color="#555" wrap="truncate">
            {"  "}({String(allLines.length)} lines)
          </Text>
        )}
      </Box>
      <Box
        borderStyle="round"
        borderColor="#333"
        paddingX={1}
        flexDirection="column"
        alignSelf="flex-start"
      >
        {visibleLines.map((lineTokens, lineIdx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable code lines
          <Box key={lineIdx} minHeight={1} flexShrink={0}>
            {showLineNumbers && (
              <Text color="#555">{String(lineIdx + 1).padStart(gutterWidth, " ")} </Text>
            )}
            <Text wrap="wrap">
              {lineTokens.map((tok, tokIdx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable token order
                <Text key={tokIdx} color={tok.color ?? TOKEN_COLORS[tok.role]}>
                  {tok.text}
                </Text>
              ))}
            </Text>
          </Box>
        ))}
        {canCollapse && !isExpanded && (
          <Box height={1} flexShrink={0} justifyContent="center">
            <Text color="#8B5CF6">
              {"  "}+{String(hiddenCount)} lines{" "}
            </Text>
            <Text color="#555" dimColor>
              Ctrl+O
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function HeadingBlock({ token }: { token: Tokens.Heading }) {
  const level = token.depth;
  const prefix = level <= 1 ? "# " : level === 2 ? "## " : "### ";
  const color = level <= 1 ? "#FF0040" : level === 2 ? "#9B30FF" : "#8B5CF6";
  return (
    <Box marginTop={level <= 1 ? 1 : 0} height={1} flexShrink={0}>
      <Text bold color={color} wrap="truncate">
        {prefix}
        <InlineTokens tokens={token.tokens} color={color} />
      </Text>
    </Box>
  );
}

function ListItemContent({
  item,
  color,
  bullet,
}: {
  item: Tokens.ListItem;
  color: string;
  bullet: string;
}) {
  const indent = " ".repeat(bullet.length);

  // Separate inline content from nested blocks
  const inlineTokens: Token[] = [];
  const nestedBlocks: Token[] = [];

  for (const tok of item.tokens) {
    if (tok.type === "text" || tok.type === "checkbox") {
      inlineTokens.push(tok);
    } else if (tok.type === "list") {
      nestedBlocks.push(tok);
    } else if (tok.type === "paragraph") {
      // Loose list — paragraph wraps the inline content
      const p = tok as Tokens.Paragraph;
      if (p.tokens) {
        for (const pt of p.tokens) inlineTokens.push(pt);
      }
    } else {
      nestedBlocks.push(tok);
    }
  }

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box minHeight={1} flexShrink={0}>
        <Text color="#8B5CF6">{bullet}</Text>
        {item.task && (
          <Text color={item.checked ? "#2d5" : "#666"}>{item.checked ? "[x] " : "[ ] "}</Text>
        )}
        <InlineTokens tokens={inlineTokens} color={color} />
      </Box>
      {nestedBlocks.map((block, bi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable nested block order
        <Box key={bi} paddingLeft={indent.length}>
          <BlockToken token={block} color={color} />
        </Box>
      ))}
    </Box>
  );
}

function ListBlock({ token, color }: { token: Tokens.List; color: string }) {
  return (
    <Box flexDirection="column">
      {token.items.map((item, i) => {
        const bullet = token.ordered
          ? `${String(i + 1 + (Number(token.start) || 1) - 1)}. `
          : "  - ";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable list item order
          <ListItemContent key={i} item={item} color={color} bullet={bullet} />
        );
      })}
    </Box>
  );
}

function HrBlock() {
  return (
    <Box height={1} flexShrink={0}>
      <Text color="#333" wrap="truncate">
        {"─".repeat(60)}
      </Text>
    </Box>
  );
}

function BlockquoteBlock({ token }: { token: Tokens.Blockquote }) {
  return (
    <Box
      borderStyle="bold"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor="#666"
      paddingLeft={1}
      flexDirection="column"
    >
      {token.tokens.map((child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable blockquote content
        <BlockToken key={i} token={child} color="#999" />
      ))}
    </Box>
  );
}

function TableBlock({ token }: { token: Tokens.Table }) {
  // Calculate column widths from header + all rows
  const colCount = token.header.length;
  const colWidths: number[] = new Array(colCount).fill(0);

  for (let c = 0; c < colCount; c++) {
    colWidths[c] = Math.max(colWidths[c] ?? 0, (token.header[c]?.text ?? "").length);
    for (const row of token.rows) {
      colWidths[c] = Math.max(colWidths[c] ?? 0, (row[c]?.text ?? "").length);
    }
  }

  const pad = (text: string, width: number) => text.padEnd(width, " ");
  const sep = colWidths.map((w) => "─".repeat(w + 2)).join("┼");

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box height={1} flexShrink={0}>
        <Text wrap="truncate">
          {token.header.map((cell, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable column order
            <Text key={c}>
              <Text color="#888">{c === 0 ? " " : " │ "}</Text>
              <Text bold color="#ccc">
                {pad(cell.text, colWidths[c] ?? 0)}
              </Text>
            </Text>
          ))}
        </Text>
      </Box>
      {/* Separator */}
      <Box height={1} flexShrink={0}>
        <Text color="#555" wrap="truncate">
          {"─"}
          {sep}
        </Text>
      </Box>
      {/* Rows */}
      {token.rows.map((row, ri) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable row order
        <Box key={ri} height={1} flexShrink={0}>
          <Text wrap="truncate">
            {row.map((cell, c) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable column order
              <Text key={c}>
                <Text color="#555">{c === 0 ? " " : " │ "}</Text>
                <Text color="#bbb">{pad(cell.text, colWidths[c] ?? 0)}</Text>
              </Text>
            ))}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

// ─── Block dispatcher ───

function BlockToken({ token, color }: { token: Token; color: string }) {
  switch (token.type) {
    case "heading":
      return <HeadingBlock token={token as Tokens.Heading} />;
    case "code": {
      const t = token as Tokens.Code;
      // Parse filename from info string: ```ts src/foo.ts
      const info = (t.lang ?? "").trim();
      const parts = info.split(/\s+/);
      const lang = parts[0] ?? "";
      const filename = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
      return <CodeBlock content={t.text} lang={lang} filename={filename} />;
    }
    case "list":
      return <ListBlock token={token as Tokens.List} color={color} />;
    case "hr":
      return <HrBlock />;
    case "blockquote":
      return <BlockquoteBlock token={token as Tokens.Blockquote} />;
    case "table":
      return <TableBlock token={token as Tokens.Table} />;
    case "paragraph": {
      const t = token as Tokens.Paragraph;
      return (
        <Box flexDirection="column">
          {t.text.split("\n").map((_, li) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable paragraph lines
            <Box key={li} minHeight={1} flexShrink={0}>
              {li === 0 ? (
                <InlineTokens tokens={t.tokens} color={color} />
              ) : (
                <Text color={color}>{t.text.split("\n")[li]}</Text>
              )}
            </Box>
          ))}
        </Box>
      );
    }
    case "space":
      return null;
    case "html": {
      // Render HTML blocks as dimmed text
      const t = token as Tokens.HTML;
      return (
        <Text color="#666" dimColor>
          {t.text}
        </Text>
      );
    }
    default:
      // Unknown block — render raw if available
      if ("raw" in token && typeof token.raw === "string" && token.raw.trim()) {
        return <Text color={color}>{token.raw}</Text>;
      }
      return null;
  }
}

// ─── Main component ───

interface Props {
  text: string;
  color?: string;
}

export function Markdown({ text, color }: Props) {
  const tokens = useMemo(() => postProcessTokens(tokenize(text)), [text]);
  const fg = color ?? "#ccc";

  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => {
        if (token.type === "space") return null;
        // Add top margin between blocks for breathing room (skip first)
        const gap =
          i > 0 &&
          (token.type === "paragraph" ||
            token.type === "list" ||
            token.type === "code" ||
            token.type === "blockquote" ||
            token.type === "table")
            ? 1
            : 0;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable block order
          <Box key={i} marginTop={gap}>
            <BlockToken token={token} color={fg} />
          </Box>
        );
      })}
    </Box>
  );
}
