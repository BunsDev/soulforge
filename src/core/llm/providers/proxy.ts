import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { ensureProxy, stopProxy } from "../../proxy/lifecycle.js";
import type { ProviderDefinition, ProviderModelInfo } from "./types.js";

const baseURL = process.env.PROXY_API_URL || "http://127.0.0.1:8317/v1";
const apiKey = process.env.PROXY_API_KEY || "soulforge";

function isAnthropicModel(modelId: string): boolean {
  return modelId.toLowerCase().startsWith("claude");
}

export const proxy: ProviderDefinition = {
  id: "proxy",
  name: "Proxy",
  envVar: "",
  icon: "󰌆", // nf-md-shield_key U+F0306
  grouped: true,

  createModel(modelId: string) {
    // Claude → Anthropic SDK (proxy serves /v1/messages)
    // Everything else → OpenAI SDK chat completions (proxy serves /v1/chat/completions)
    // Must use .chat() — default uses Responses API (/v1/responses) which proxy can't translate for all providers
    if (isAnthropicModel(modelId)) {
      return createAnthropic({ baseURL, apiKey })(modelId);
    }
    return createOpenAI({ baseURL, apiKey }).chat(modelId);
  },

  async fetchModels(): Promise<ProviderModelInfo[] | null> {
    return null;
  },

  async onActivate() {
    await ensureProxy();
  },

  onDeactivate() {
    stopProxy();
  },

  fallbackModels: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5" },
  ],

  contextWindows: [
    ["claude-opus-4-6", 1_000_000],
    ["claude-sonnet-4-6", 1_000_000],
    ["claude-sonnet-4-5", 1_000_000],
    ["claude-opus-4-5", 1_000_000],
    ["claude-sonnet-4", 1_000_000],
    ["claude-opus-4", 1_000_000],
    ["claude-opus", 200_000],
    ["claude-sonnet", 200_000],
    ["claude-haiku", 200_000],
    ["claude-3", 200_000],
    ["gpt-4", 128_000],
    ["gpt-4o", 128_000],
    ["gpt-4.1", 1_000_000],
    ["o1", 200_000],
    ["o3", 200_000],
    ["o4-mini", 200_000],
    ["gemini-2", 1_000_000],
    ["gemini-1.5", 1_000_000],
  ],
};
