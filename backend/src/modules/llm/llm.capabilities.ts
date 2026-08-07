import { InvalidInputError } from '../../errors';
import { ILlmProvider } from './llm.interface';
import { LlmProviderCapabilities } from './llm.types';

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

export function ensureLlmProviderCapability(
  provider: Pick<ILlmProvider, 'capabilities' | 'config'>,
  capability: LlmProviderCapability,
  operationLabel: string = CAPABILITY_OPERATION_LABELS[capability],
): void {
  if (provider.capabilities[capability]) {
    return;
  }

  throw new InvalidInputError(
    `Provider type ${provider.config.type} does not support ${operationLabel}.`,
    LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
  );
}
