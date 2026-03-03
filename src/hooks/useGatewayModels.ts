import { useEffect, useState } from "react";
import {
  fetchGatewayModels,
  type GatewaySubProvider,
  getCachedGatewayModels,
  type ProviderModelInfo,
} from "../core/llm/models.js";

interface UseGatewayModelsReturn {
  subProviders: GatewaySubProvider[];
  modelsByProvider: Record<string, ProviderModelInfo[]>;
  loading: boolean;
  error?: string;
}

export function useGatewayModels(active: boolean): UseGatewayModelsReturn {
  const [subProviders, setSubProviders] = useState<GatewaySubProvider[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModelInfo[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!active) {
      setSubProviders([]);
      setModelsByProvider({});
      setLoading(false);
      setError(undefined);
      return;
    }

    const cached = getCachedGatewayModels();
    if (cached) {
      setSubProviders(cached.subProviders);
      setModelsByProvider(cached.modelsByProvider);
      setLoading(false);
      setError(cached.error);
      return;
    }

    setLoading(true);
    setError(undefined);
    let cancelled = false;

    fetchGatewayModels().then((result) => {
      if (!cancelled) {
        setSubProviders(result.subProviders);
        setModelsByProvider(result.modelsByProvider);
        setError(result.error);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return { subProviders, modelsByProvider, loading, error };
}
