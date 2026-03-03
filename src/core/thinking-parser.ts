/**
 * Streaming state machine for parsing `<thinking>...</thinking>` tags
 * embedded in text-delta content. Handles partial tags split across deltas.
 */

export interface ParsedChunk {
  type: "text" | "reasoning-start" | "reasoning-end" | "reasoning-content";
  content: string;
}

type State = "outside" | "inside";

const OPEN_TAG = "<thinking>";
const CLOSE_TAG = "</thinking>";

export function createThinkingParser(): {
  feed(delta: string): ParsedChunk[];
  flush(): ParsedChunk[];
} {
  let state: State = "outside";
  let pendingTag = "";

  function feed(delta: string): ParsedChunk[] {
    const chunks: ParsedChunk[] = [];
    let buf = pendingTag + delta;
    pendingTag = "";

    while (buf.length > 0) {
      if (state === "outside") {
        const tagIdx = buf.indexOf("<");
        if (tagIdx === -1) {
          // No potential tag start — all text
          if (buf.length > 0) chunks.push({ type: "text", content: buf });
          buf = "";
        } else {
          // Emit text before the `<`
          if (tagIdx > 0) {
            chunks.push({ type: "text", content: buf.slice(0, tagIdx) });
            buf = buf.slice(tagIdx);
          }
          // Check if we have enough to match the open tag
          if (buf.length >= OPEN_TAG.length) {
            if (buf.startsWith(OPEN_TAG)) {
              chunks.push({ type: "reasoning-start", content: "" });
              state = "inside";
              buf = buf.slice(OPEN_TAG.length);
            } else {
              // Not a thinking tag — emit the `<` as text and continue
              chunks.push({ type: "text", content: "<" });
              buf = buf.slice(1);
            }
          } else {
            // Partial — could be `<thin` etc. Buffer it.
            if (OPEN_TAG.startsWith(buf)) {
              pendingTag = buf;
              buf = "";
            } else {
              // Doesn't match open tag prefix — emit `<` as text
              chunks.push({ type: "text", content: "<" });
              buf = buf.slice(1);
            }
          }
        }
      } else {
        // state === "inside"
        const tagIdx = buf.indexOf("<");
        if (tagIdx === -1) {
          // No potential tag — all reasoning content
          if (buf.length > 0) chunks.push({ type: "reasoning-content", content: buf });
          buf = "";
        } else {
          // Emit reasoning content before the `<`
          if (tagIdx > 0) {
            chunks.push({ type: "reasoning-content", content: buf.slice(0, tagIdx) });
            buf = buf.slice(tagIdx);
          }
          // Check for close tag
          if (buf.length >= CLOSE_TAG.length) {
            if (buf.startsWith(CLOSE_TAG)) {
              chunks.push({ type: "reasoning-end", content: "" });
              state = "outside";
              buf = buf.slice(CLOSE_TAG.length);
            } else {
              // Not a close tag — emit `<` as reasoning content
              chunks.push({ type: "reasoning-content", content: "<" });
              buf = buf.slice(1);
            }
          } else {
            // Partial — could be `</thin` etc. Buffer it.
            if (CLOSE_TAG.startsWith(buf)) {
              pendingTag = buf;
              buf = "";
            } else {
              // Doesn't match close tag prefix — emit `<` as reasoning content
              chunks.push({ type: "reasoning-content", content: "<" });
              buf = buf.slice(1);
            }
          }
        }
      }
    }

    return chunks;
  }

  function flush(): ParsedChunk[] {
    const chunks: ParsedChunk[] = [];
    if (pendingTag.length > 0) {
      // Buffered partial tag never resolved — emit as text/content
      const chunkType = state === "outside" ? "text" : "reasoning-content";
      chunks.push({ type: chunkType, content: pendingTag });
      pendingTag = "";
    }
    if (state === "inside") {
      chunks.push({ type: "reasoning-end", content: "" });
      state = "outside";
    }
    return chunks;
  }

  return { feed, flush };
}
