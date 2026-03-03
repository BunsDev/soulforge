import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderDefinition, ProviderModelInfo } from "./types.js";

interface OpenAIModel {
  id: string;
  context_window?: number;
}

const OPENAI_PREFIXES = ["gpt-4", "gpt-3.5", "o1", "o3", "chatgpt"];

export const openai: ProviderDefinition = {
  id: "openai",
  name: "OpenAI",
  envVar: "OPENAI_API_KEY",
  icon: "󰧑", // nf-md-head_snowflake U+F09D1

  createModel(modelId: string) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    return createOpenAI()(modelId);
  },

  async fetchModels(): Promise<ProviderModelInfo[] | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenAI API ${String(res.status)}`);
    const data = (await res.json()) as { data: OpenAIModel[] };
    const result: ProviderModelInfo[] = [];
    for (const m of data.data) {
      if (OPENAI_PREFIXES.some((p) => m.id.startsWith(p))) {
        result.push({ id: m.id, name: m.id });
      }
    }
    return result;
  },

  fallbackModels: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "o3-mini", name: "o3 Mini" },
    { id: "o1", name: "o1" },
  ],

  contextWindows: [
    ["gpt-4o-mini", 128_000],
    ["gpt-4o", 128_000],
    ["gpt-4-turbo", 128_000],
    ["gpt-4-32k", 32_000],
    ["gpt-4", 8_192],
    ["gpt-3.5-turbo-16k", 16_000],
    ["gpt-3.5", 4_096],
    ["o3-mini", 200_000],
    ["o3", 200_000],
    ["o1-mini", 128_000],
    ["o1", 200_000],
  ],
};
