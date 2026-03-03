import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { providerIcon } from "../core/icons.js";
import { PROVIDER_CONFIGS } from "../core/llm/models.js";
import { checkProviders } from "../core/llm/provider.js";
import { useGatewayModels } from "../hooks/useGatewayModels.js";
import { useProviderModels } from "../hooks/useProviderModels.js";
import { POPUP_BG, POPUP_HL, PopupRow, SPINNER_FRAMES_FILLED } from "./shared.js";

const POPUP_WIDTH = 44;

interface Props {
  visible: boolean;
  activeModel: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}

type Level = "provider" | "subprovider" | "model";

export function LlmSelector({ visible, activeModel, onSelect, onClose }: Props) {
  const [level, setLevel] = useState<Level>("provider");
  const [providerCursor, setProviderCursor] = useState(0);
  const [subproviderCursor, setSubproviderCursor] = useState(0);
  const [modelCursor, setModelCursor] = useState(0);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [expandedSubprovider, setExpandedSubprovider] = useState<string | null>(null);
  const [spinnerIdx, setSpinnerIdx] = useState(0);

  // Direct provider models (non-gateway)
  const directProviderId =
    expandedProvider && expandedProvider !== "gateway" ? expandedProvider : null;
  const {
    models: directModels,
    loading: directLoading,
    error: directError,
  } = useProviderModels(directProviderId);

  // Gateway models
  const gatewayActive =
    level === "subprovider" || (level === "model" && expandedProvider === "gateway");
  const {
    subProviders,
    modelsByProvider: gatewayModelsByProvider,
    loading: gatewayLoading,
    error: gatewayError,
  } = useGatewayModels(gatewayActive);

  const loading = expandedProvider === "gateway" ? gatewayLoading : directLoading;

  const providerStatuses = checkProviders();

  useEffect(() => {
    if (visible) {
      setLevel("provider");
      setExpandedProvider(null);
      setExpandedSubprovider(null);
      setModelCursor(0);
      setSubproviderCursor(0);
    }
  }, [visible]);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setSpinnerIdx((prev) => (prev + 1) % SPINNER_FRAMES_FILLED.length);
    }, 80);
    return () => clearInterval(interval);
  }, [loading]);

  // Determine current models for the model level
  const currentModels =
    expandedProvider === "gateway" && expandedSubprovider
      ? (gatewayModelsByProvider[expandedSubprovider] ?? [])
      : directModels;

  const currentError = expandedProvider === "gateway" ? gatewayError : directError;

  useInput(
    (input, key) => {
      if (level === "provider") {
        if (key.escape) {
          onClose();
          return;
        }
        if (key.return) {
          const provider = PROVIDER_CONFIGS[providerCursor];
          if (provider) {
            setExpandedProvider(provider.id);
            if (provider.id === "gateway") {
              setLevel("subprovider");
              setSubproviderCursor(0);
            } else {
              setLevel("model");
              setModelCursor(0);
            }
          }
          return;
        }
        if (key.upArrow || input === "k") {
          setProviderCursor((prev) => (prev > 0 ? prev - 1 : PROVIDER_CONFIGS.length - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setProviderCursor((prev) => (prev < PROVIDER_CONFIGS.length - 1 ? prev + 1 : 0));
          return;
        }
      }

      if (level === "subprovider") {
        if (key.escape || key.leftArrow) {
          setLevel("provider");
          setExpandedProvider(null);
          setExpandedSubprovider(null);
          return;
        }
        if (key.return && !gatewayLoading && subProviders.length > 0) {
          const sub = subProviders[subproviderCursor];
          if (sub) {
            setExpandedSubprovider(sub.id);
            setLevel("model");
            setModelCursor(0);
          }
          return;
        }
        if (key.upArrow || input === "k") {
          setSubproviderCursor((prev) =>
            prev > 0 ? prev - 1 : Math.max(0, subProviders.length - 1),
          );
          return;
        }
        if (key.downArrow || input === "j") {
          setSubproviderCursor((prev) => (prev < subProviders.length - 1 ? prev + 1 : 0));
          return;
        }
      }

      if (level === "model") {
        if (key.escape || key.leftArrow) {
          if (expandedProvider === "gateway") {
            setLevel("subprovider");
            setExpandedSubprovider(null);
          } else {
            setLevel("provider");
            setExpandedProvider(null);
          }
          return;
        }
        if (key.return && !loading && currentModels.length > 0) {
          const model = currentModels[modelCursor];
          if (model) {
            if (expandedProvider === "gateway") {
              onSelect(`gateway/${model.id}`);
            } else {
              onSelect(`${expandedProvider}/${model.id}`);
            }
            onClose();
          }
          return;
        }
        if (key.upArrow || input === "k") {
          setModelCursor((prev) => (prev > 0 ? prev - 1 : Math.max(0, currentModels.length - 1)));
          return;
        }
        if (key.downArrow || input === "j") {
          setModelCursor((prev) => (prev < currentModels.length - 1 ? prev + 1 : 0));
          return;
        }
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

  // Parse activeModel: "gateway/anthropic/claude-opus-4.6" or "anthropic/claude-opus-4.6"
  const slashIdx = activeModel.indexOf("/");
  const activeProvider = slashIdx >= 0 ? activeModel.slice(0, slashIdx) : "";
  const activeModelId = slashIdx >= 0 ? activeModel.slice(slashIdx + 1) : "";
  const innerW = POPUP_WIDTH - 2; // inside border

  if (level === "provider") {
    return (
      <Box
        position="absolute"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        height="100%"
      >
        <Box flexDirection="column" borderStyle="round" borderColor="#8B5CF6" width={POPUP_WIDTH}>
          {/* Title */}
          <PopupRow w={innerW}>
            <Text color="white" bold backgroundColor={POPUP_BG}>
              {"\uDB80\uDE26"} Select Provider
            </Text>
          </PopupRow>
          {/* Separator */}
          <PopupRow w={innerW}>
            <Text color="#333" backgroundColor={POPUP_BG}>
              {"─".repeat(innerW - 4)}
            </Text>
          </PopupRow>
          {/* Empty row for spacing */}
          <PopupRow w={innerW}>
            <Text>{""}</Text>
          </PopupRow>

          {PROVIDER_CONFIGS.map((provider, i) => {
            const isActive = i === providerCursor;
            const status = providerStatuses.find((s) => s.id === provider.id);
            const available = status?.available ?? false;
            const bg = isActive ? POPUP_HL : POPUP_BG;
            return (
              <PopupRow key={provider.id} bg={bg} w={innerW}>
                <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                  {isActive ? "› " : "  "}
                </Text>
                <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#aaa"} bold={isActive}>
                  {providerIcon(provider.id)} {provider.name}
                </Text>
                <Text backgroundColor={bg}> </Text>
                <Text backgroundColor={bg} color={available ? "#00FF00" : "#FF0040"}>
                  {available ? "●" : "○"}
                </Text>
              </PopupRow>
            );
          })}

          {/* Empty row for spacing */}
          <PopupRow w={innerW}>
            <Text>{""}</Text>
          </PopupRow>
          {/* Hints */}
          <PopupRow w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              ↑↓ navigate ⏎ select esc close
            </Text>
          </PopupRow>
        </Box>
      </Box>
    );
  }

  if (level === "subprovider") {
    const totalModels = Object.values(gatewayModelsByProvider).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );

    return (
      <Box
        position="absolute"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        height="100%"
      >
        <Box flexDirection="column" borderStyle="round" borderColor="#8B5CF6" width={POPUP_WIDTH}>
          {/* Title */}
          <PopupRow w={innerW}>
            <Text color="white" bold backgroundColor={POPUP_BG}>
              {providerIcon("gateway")} Gateway (Vercel)
            </Text>
            {!gatewayLoading && subProviders.length > 0 && (
              <Text color="#555" dimColor backgroundColor={POPUP_BG}>
                {" "}
                {String(totalModels)} models
              </Text>
            )}
          </PopupRow>
          {/* Separator */}
          <PopupRow w={innerW}>
            <Text color="#333" backgroundColor={POPUP_BG}>
              {"─".repeat(innerW - 4)}
            </Text>
          </PopupRow>
          {/* Back */}
          <PopupRow w={innerW}>
            <Text color="#666" backgroundColor={POPUP_BG}>
              {" "}
              esc to go back
            </Text>
          </PopupRow>
          {/* Empty row */}
          <PopupRow w={innerW}>
            <Text>{""}</Text>
          </PopupRow>

          {/* Error warning */}
          {gatewayError && (
            <PopupRow w={innerW}>
              <Text color="#f44" backgroundColor={POPUP_BG}>
                ⚠ {gatewayError}
              </Text>
            </PopupRow>
          )}

          {gatewayLoading ? (
            <PopupRow w={innerW}>
              <Text color="#9B30FF" backgroundColor={POPUP_BG}>
                {SPINNER_FRAMES_FILLED[spinnerIdx]} fetching providers...
              </Text>
            </PopupRow>
          ) : (
            subProviders.map((sub, i) => {
              const isActive = i === subproviderCursor;
              const modelCount = gatewayModelsByProvider[sub.id]?.length ?? 0;
              const bg = isActive ? POPUP_HL : POPUP_BG;
              return (
                <PopupRow key={sub.id} bg={bg} w={innerW}>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                    {isActive ? "› " : "  "}
                  </Text>
                  <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#aaa"} bold={isActive}>
                    {providerIcon(sub.id)} {sub.name}
                  </Text>
                  <Text backgroundColor={bg} color="#555" dimColor>
                    {" "}
                    ({String(modelCount)})
                  </Text>
                </PopupRow>
              );
            })
          )}

          {/* Empty row */}
          <PopupRow w={innerW}>
            <Text>{""}</Text>
          </PopupRow>
          {/* Hints */}
          <PopupRow w={innerW}>
            <Text color="#555" backgroundColor={POPUP_BG}>
              ↑↓ navigate ⏎ select esc back
            </Text>
          </PopupRow>
        </Box>
      </Box>
    );
  }

  // Level: model
  const isGatewayModel = expandedProvider === "gateway";
  const headerIcon = isGatewayModel
    ? providerIcon(expandedSubprovider ?? "")
    : providerIcon(expandedProvider ?? "");
  const headerName = isGatewayModel
    ? (subProviders.find((s) => s.id === expandedSubprovider)?.name ?? expandedSubprovider ?? "")
    : (PROVIDER_CONFIGS.find((p) => p.id === expandedProvider)?.name ?? expandedProvider ?? "");

  return (
    <Box
      position="absolute"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
    >
      <Box flexDirection="column" borderStyle="round" borderColor="#8B5CF6" width={POPUP_WIDTH}>
        {/* Title */}
        <PopupRow w={innerW}>
          <Text color="white" bold backgroundColor={POPUP_BG}>
            {headerIcon} {headerName}
          </Text>
          {isGatewayModel && (
            <Text color="#555" dimColor backgroundColor={POPUP_BG}>
              {" "}
              via gateway
            </Text>
          )}
        </PopupRow>
        {/* Separator */}
        <PopupRow w={innerW}>
          <Text color="#333" backgroundColor={POPUP_BG}>
            {"─".repeat(innerW - 4)}
          </Text>
        </PopupRow>
        {/* Back */}
        <PopupRow w={innerW}>
          <Text color="#666" backgroundColor={POPUP_BG}>
            {" "}
            esc to go back
          </Text>
        </PopupRow>
        {/* Empty row */}
        <PopupRow w={innerW}>
          <Text>{""}</Text>
        </PopupRow>

        {/* Error warning */}
        {currentError && (
          <PopupRow w={innerW}>
            <Text color="#f44" backgroundColor={POPUP_BG}>
              ⚠ {currentError}
            </Text>
          </PopupRow>
        )}

        {loading ? (
          <PopupRow w={innerW}>
            <Text color="#9B30FF" backgroundColor={POPUP_BG}>
              {SPINNER_FRAMES_FILLED[spinnerIdx]} fetching models...
            </Text>
          </PopupRow>
        ) : (
          currentModels.map((model, i) => {
            const isActive = i === modelCursor;
            // For gateway: activeModelId is "anthropic/claude-opus-4.6", model.id is "anthropic/claude-opus-4.6"
            // For direct: activeProvider is "anthropic", model.id is "claude-opus-4.6"
            const isCurrent = isGatewayModel
              ? activeProvider === "gateway" && model.id === activeModelId
              : expandedProvider === activeProvider && model.id === activeModelId;
            const bg = isActive ? POPUP_HL : POPUP_BG;
            // Show just the model name part for gateway models (strip provider prefix)
            const displayId = isGatewayModel
              ? model.id.includes("/")
                ? model.id.slice(model.id.indexOf("/") + 1)
                : model.id
              : model.id;
            return (
              <PopupRow key={model.id} bg={bg} w={innerW}>
                <Text backgroundColor={bg} color={isActive ? "#FF0040" : "#555"}>
                  {isActive ? "› " : "  "}
                </Text>
                <Text
                  backgroundColor={bg}
                  color={isActive ? "#FF0040" : isCurrent ? "#00FF00" : "#aaa"}
                  bold={isActive}
                >
                  {displayId}
                </Text>
                {isCurrent && (
                  <Text backgroundColor={bg} color="#00FF00">
                    {" "}
                    ✓
                  </Text>
                )}
              </PopupRow>
            );
          })
        )}

        {/* Empty row */}
        <PopupRow w={innerW}>
          <Text>{""}</Text>
        </PopupRow>
        {/* Hints */}
        <PopupRow w={innerW}>
          <Text color="#555" backgroundColor={POPUP_BG}>
            ↑↓ navigate ⏎ select esc back
          </Text>
        </PopupRow>
      </Box>
    </Box>
  );
}
