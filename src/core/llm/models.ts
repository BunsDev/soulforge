import { getAllProviders, getProvider } from "./providers/index.js";
import type { ProviderModelInfo } from "./providers/types.js";

// Re-export for backward compatibility
export type { ProviderModelInfo } from "./providers/types.js";

// ─── Types ───

export interface FetchModelsResult {
  models: ProviderModelInfo[];
  error?: string;
}

export interface GatewaySubProvider {
  id: string;
  name: string;
}

export interface GatewayModelsResult {
  subProviders: GatewaySubProvider[];
  modelsByProvider: Record<string, ProviderModelInfo[]>;
  error?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  envVar: string;
}

// ─── Provider Configs (derived from registry) ───

export const PROVIDER_CONFIGS: ProviderConfig[] = getAllProviders().map((p) => ({
  id: p.id,
  name: p.name,
  envVar: p.envVar,
}));

// ─── Context Windows ───

const DEFAULT_CONTEXT_TOKENS = 128_000;

/**
 * Get the context window size (in tokens) for a model ID.
 * Checks cached API data first, then falls back to provider-defined patterns.
 * Accepts full "provider/model" format or just the model part.
 * Pattern order matters — specific patterns must come before general ones.
 */
export function getModelContextWindow(modelId: string): number {
  const slashIdx = modelId.indexOf("/");
  const providerId = slashIdx >= 0 ? modelId.slice(0, slashIdx) : "";
  const model = slashIdx >= 0 ? modelId.slice(slashIdx + 1) : modelId;

  // 1. Check cached API data (most accurate — comes from the provider)
  if (providerId && providerId !== "gateway") {
    const cached = modelCache.get(providerId);
    if (cached) {
      const match = cached.find((m) => m.id === model);
      if (match?.contextWindow) return match.contextWindow;
    }
  }
  // Gateway models use "gateway/sub-provider/model" — check sub-provider cache
  if (providerId === "gateway" && gatewayCache) {
    for (const models of Object.values(gatewayCache.modelsByProvider)) {
      const match = models.find((m) => m.id === model || modelId.endsWith(m.id));
      if (match?.contextWindow) return match.contextWindow;
    }
  }

  // 2. Fallback to provider-defined context window patterns
  for (const provider of getAllProviders()) {
    for (const [pattern, tokens] of provider.contextWindows) {
      if (model.includes(pattern)) return tokens;
    }
  }
  return DEFAULT_CONTEXT_TOKENS;
}

// ─── Cache ───

const modelCache = new Map<string, ProviderModelInfo[]>();

export function getCachedModels(providerId: string): ProviderModelInfo[] | null {
  return modelCache.get(providerId) ?? null;
}

// ─── Public API ───

export async function fetchProviderModels(providerId: string): Promise<FetchModelsResult> {
  // Check cache first
  const cached = modelCache.get(providerId);
  if (cached) return { models: cached };

  const provider = getProvider(providerId);
  if (!provider) return { models: [] };

  try {
    const models = await provider.fetchModels();
    if (models) {
      modelCache.set(providerId, models);
      return { models };
    }
    return { models: provider.fallbackModels };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { models: provider.fallbackModels, error: `API error: ${msg}` };
  }
}

// ─── Gateway Models ───

interface GatewayApiModel {
  id: string;
  owned_by: string;
  name: string;
  type: string;
}

let gatewayCache: GatewayModelsResult | null = null;

export function getCachedGatewayModels(): GatewayModelsResult | null {
  return gatewayCache;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function fetchGatewayModels(): Promise<GatewayModelsResult> {
  if (gatewayCache) return gatewayCache;

  if (!process.env.AI_GATEWAY_API_KEY) {
    return { subProviders: [], modelsByProvider: {}, error: "AI_GATEWAY_API_KEY not set" };
  }

  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models");
    if (!res.ok) {
      return {
        subProviders: [],
        modelsByProvider: {},
        error: `Gateway error: ${String(res.status)}`,
      };
    }

    const data = (await res.json()) as { data: GatewayApiModel[] };
    const grouped: Record<string, ProviderModelInfo[]> = {};

    for (const m of data.data) {
      if (m.type !== "language") continue;
      const owner = m.owned_by;
      if (!grouped[owner]) grouped[owner] = [];
      grouped[owner].push({ id: m.id, name: m.name });
    }

    const subProviders: GatewaySubProvider[] = Object.keys(grouped)
      .sort()
      .map((id) => ({ id, name: titleCase(id) }));

    const result: GatewayModelsResult = { subProviders, modelsByProvider: grouped };
    gatewayCache = result;
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { subProviders: [], modelsByProvider: {}, error: `Gateway error: ${msg}` };
  }
}
