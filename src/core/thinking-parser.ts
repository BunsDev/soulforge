/**
 * Streaming state machine for parsing thinking/reasoning tags
 * embedded in text-delta content. Handles partial tags split across deltas.
 *
 * Supported tag pairs:
 *   <thinking>...</thinking>
 *   <think>...</think>
 *   <reasoning>...</reasoning>
 *   <reason>...</reason>
 */

export interface ParsedChunk {
  type: "text" | "reasoning-start" | "reasoning-end" | "reasoning-content";
  content: string;
}

type State = "outside" | "inside";

const TAG_PAIRS = [
  { open: "<thinking>", close: "</thinking>" },
  { open: "<think>", close: "</think>" },
  { open: "<reasoning>", close: "</reasoning>" },
  { open: "<reason>", close: "</reason>" },
];

const MAX_TAG_LEN = Math.max(...TAG_PAIRS.map((p) => Math.max(p.open.length, p.close.length)));

export function createThinkingParser(): {
  feed(delta: string): ParsedChunk[];
  flush(): ParsedChunk[];
} {
  let state: State = "outside";
  let pendingTag = "";
  let activeClose = "";

  function tryMatchOpen(buf: string): { tag: (typeof TAG_PAIRS)[0]; len: number } | null {
    for (const pair of TAG_PAIRS) {
      if (buf.startsWith(pair.open)) return { tag: pair, len: pair.open.length };
    }
    return null;
  }

  function couldBeOpenPrefix(buf: string): boolean {
    return TAG_PAIRS.some((p) => p.open.startsWith(buf));
  }

  function couldBeClosePrefix(buf: string): boolean {
    return activeClose.startsWith(buf);
  }

  function feed(delta: string): ParsedChunk[] {
    const chunks: ParsedChunk[] = [];
    let buf = pendingTag + delta;
    pendingTag = "";

    while (buf.length > 0) {
      if (state === "outside") {
        const tagIdx = buf.indexOf("<");
        if (tagIdx === -1) {
          if (buf.length > 0) chunks.push({ type: "text", content: buf });
          buf = "";
        } else {
          if (tagIdx > 0) {
            chunks.push({ type: "text", content: buf.slice(0, tagIdx) });
            buf = buf.slice(tagIdx);
          }
          const match = tryMatchOpen(buf);
          if (match) {
            chunks.push({ type: "reasoning-start", content: "" });
            state = "inside";
            activeClose = match.tag.close;
            buf = buf.slice(match.len);
          } else if (buf.length < MAX_TAG_LEN && couldBeOpenPrefix(buf)) {
            pendingTag = buf;
            buf = "";
          } else {
            chunks.push({ type: "text", content: "<" });
            buf = buf.slice(1);
          }
        }
      } else {
        const tagIdx = buf.indexOf("<");
        if (tagIdx === -1) {
          if (buf.length > 0) chunks.push({ type: "reasoning-content", content: buf });
          buf = "";
        } else {
          if (tagIdx > 0) {
            chunks.push({ type: "reasoning-content", content: buf.slice(0, tagIdx) });
            buf = buf.slice(tagIdx);
          }
          if (buf.length >= activeClose.length && buf.startsWith(activeClose)) {
            chunks.push({ type: "reasoning-end", content: "" });
            state = "outside";
            buf = buf.slice(activeClose.length);
            activeClose = "";
          } else if (buf.length < activeClose.length && couldBeClosePrefix(buf)) {
            pendingTag = buf;
            buf = "";
          } else {
            chunks.push({ type: "reasoning-content", content: "<" });
            buf = buf.slice(1);
          }
        }
      }
    }

    return chunks;
  }

  function flush(): ParsedChunk[] {
    const chunks: ParsedChunk[] = [];
    if (pendingTag.length > 0) {
      const chunkType = state === "outside" ? "text" : "reasoning-content";
      chunks.push({ type: chunkType, content: pendingTag });
      pendingTag = "";
    }
    if (state === "inside") {
      chunks.push({ type: "reasoning-end", content: "" });
      state = "outside";
      activeClose = "";
    }
    return chunks;
  }

  return { feed, flush };
}
