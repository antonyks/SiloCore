import { InvalidInputError } from '../../errors';
import { ILlmProvider } from './llm.interface';
import { LlmProviderCapabilities, LlmProviderType, SUPPORTED_LLM_PROVIDER_TYPES } from './llm.types';

export const LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE = 'LLM_PROVIDER_CAPABILITY_UNSUPPORTED';

export type LlmProviderCapability = keyof LlmProviderCapabilities;

const CAPABILITY_OPERATION_LABELS: Record<LlmProviderCapability, string> = {
  completion: 'completion',
  streaming: 'streaming',
  reasoning: 'reasoning',
  modelListing: 'model listing',
  modelPulling: 'model pulling',
  embeddings: 'embeddings',
  toolCalling: 'tool calling',
  structuredOutput: 'structured output',
  tokenCounting: 'token counting',
};

function safeCapabilityLabel(value: unknown): string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAPABILITY_OPERATION_LABELS, value)
    ? CAPABILITY_OPERATION_LABELS[value as LlmProviderCapability]
    : 'this operation';
}

function safeProviderType(value: unknown): string {
  return typeof value === 'string' && SUPPORTED_LLM_PROVIDER_TYPES.includes(value as LlmProviderType)
    ? value
    : 'unknown';
}

export class LlmCapabilityError extends InvalidInputError {
  readonly providerType: string;
  readonly capability: LlmProviderCapability;

  constructor(providerType: unknown, capability: LlmProviderCapability) {
    super(
      `Provider type ${safeProviderType(providerType)} does not support ${safeCapabilityLabel(capability)}.`,
      LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
    );
    this.name = 'LlmCapabilityError';
    Object.setPrototypeOf(this, LlmCapabilityError.prototype);
    this.providerType = safeProviderType(providerType);
    this.capability = capability;
  }
}

export function getPublicCapabilityErrorMessage(error: LlmCapabilityError): string {
  return `Provider type ${safeProviderType(error.providerType)} does not support ${safeCapabilityLabel(error.capability)}.`;
}

export function ensureLlmProviderCapability(
  provider: Pick<ILlmProvider, 'capabilities' | 'config'>,
  capability: LlmProviderCapability,
): void {
  if (provider.capabilities[capability]) {
    return;
  }

  throw new LlmCapabilityError(provider.config.type, capability);
}
