import type {
  LlmProviderCapabilities,
  LlmProviderModelListResult,
  SanitizedLlmProviderConfig,
} from "../types";

export const UNSUPPORTED_PROVIDER_CAPABILITIES: LlmProviderCapabilities = {
  completion: false,
  streaming: false,
  reasoning: false,
  modelListing: false,
  modelPulling: false,
  embeddings: false,
  toolCalling: false,
  structuredOutput: false,
  tokenCounting: false,
};

export const canPullProviderModel = (
  provider: Pick<SanitizedLlmProviderConfig | LlmProviderModelListResult, "capabilities">,
) => provider.capabilities.modelPulling;

export const getModelProviderCapabilities = (
  providerId: string,
  providers: LlmProviderModelListResult[],
): LlmProviderCapabilities => {
  return (
    providers.find((provider) => provider.providerId === providerId)?.capabilities ??
    UNSUPPORTED_PROVIDER_CAPABILITIES
  );
};
