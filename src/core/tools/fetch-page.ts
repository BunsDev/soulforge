import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ToolResult } from "../../types/index.js";
import { getSecret } from "../secrets.js";

const MAX_CONTENT_LENGTH = 16_000;

const pageCache = new Map<string, { content: string; ts: number; backend: string }>();
const CACHE_TTL = 5 * 60_000;

function getCached(url: string): { content: string; backend: string } | null {
  const entry = pageCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    pageCache.delete(url);
    return null;
  }
  return { content: entry.content, backend: entry.backend };
}

async function jinaRead(url: string): Promise<{ content: string; backend: string } | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "text/markdown",
    };
    const apiKey = getSecret("jina-api-key");
    const keyed = !!apiKey;
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;

    const text = await res.text();
    if (text && text.length > 100) {
      return { content: text, backend: keyed ? "jina-api" : "jina" };
    }
  } catch {}
  return null;
}

function extractWithReadability(html: string): string {
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document as unknown as Document, { charThreshold: 50 });
    const article = reader.parse();
    if (article?.textContent) {
      const clean = article.textContent
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (clean.length > 200) {
        const header = article.title ? `# ${article.title}\n\n` : "";
        return `${header}${clean}`;
      }
    }
  } catch {}
  return fallbackExtract(html);
}

function fallbackExtract(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_CONTENT_LENGTH) return text;
  return `${text.slice(0, MAX_CONTENT_LENGTH)}\n\n... [truncated]`;
}

export const fetchPageTool = {
  name: "fetch_page",
  description:
    "Fetch a web page and extract its text content. Use after web_search to read full articles or documentation pages.",
  execute: async (args: { url: string }): Promise<ToolResult> => {
    const cached = getCached(args.url);
    if (cached) {
      return { success: true, output: truncate(cached.content), backend: cached.backend };
    }

    try {
      const jina = await jinaRead(args.url);
      if (jina) {
        pageCache.set(args.url, { content: jina.content, ts: Date.now(), backend: jina.backend });
        return { success: true, output: truncate(jina.content), backend: jina.backend };
      }

      const res = await fetch(args.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SoulForge/1.0; +https://github.com/proxysoul)",
          Accept: "text/html,application/xhtml+xml,application/json,text/plain",
        },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      });

      if (!res.ok) {
        const msg = `HTTP ${String(res.status)} fetching ${args.url}`;
        return { success: false, output: msg, error: msg };
      }

      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();
      let content: string;

      if (contentType.includes("application/json")) {
        content = body;
      } else {
        content = extractWithReadability(body);
      }

      const fallbackBackend = contentType.includes("application/json") ? "fetch" : "readability";
      pageCache.set(args.url, { content, ts: Date.now(), backend: fallbackBackend });
      return { success: true, output: truncate(content), backend: fallbackBackend };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Fetch error: ${msg}`, error: msg };
    }
  },
};
