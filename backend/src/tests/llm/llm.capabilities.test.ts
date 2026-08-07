import { describe, expect, it, jest } from '@jest/globals';
import {
  ensureLlmProviderCapability,
  LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
} from '../../modules/llm/llm.capabilities';
import { ILlmProvider } from '../../modules/llm/llm.interface';
import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProviderCapabilities,
  LlmProviderConfig,
  LlmStreamChunk,
} from '../../modules/llm/llm.types';
import { InvalidInputError } from '../../errors';

const CAPABILITIES: LlmProviderCapabilities = {
  completion: true,
  streaming: true,
  reasoning: false,
  modelListing: true,
  modelPulling: true,
  embeddings: false,
  toolCalling: false,
  structuredOutput: false,
  tokenCounting: false,
};

function createProvider(capabilities: LlmProviderCapabilities = CAPABILITIES): ILlmProvider {
  const config: LlmProviderConfig = {
    id: 'provider-1',
    name: 'Provider',
    type: 'openai-compatible',
    enabled: true,
    baseUrl: 'https://api.example.com/v1',
    defaultModel: 'test-model',
  };

  return {
    id: config.id,
    type: config.type,
    isEnabled: config.enabled,
    capabilities,
    config,
    initialise: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    complete: jest.fn<(request: LlmCompletionRequest) => Promise<LlmCompletionResponse>>(),
    streamComplete: jest.fn<(request: LlmCompletionRequest) => AsyncIterable<LlmStreamChunk>>(),
    listModels: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
    pullModel: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe('ensureLlmProviderCapability', () => {
  it('allows supported operations', () => {
    expect(() => ensureLlmProviderCapability(createProvider(), 'completion')).not.toThrow();
    expect(() => ensureLlmProviderCapability(createProvider(), 'streaming')).not.toThrow();
    expect(() => ensureLlmProviderCapability(createProvider(), 'modelListing')).not.toThrow();
    expect(() => ensureLlmProviderCapability(createProvider(), 'modelPulling')).not.toThrow();
  });

  it('fails unsupported completion with a stable code', () => {
    const provider = createProvider({
      ...CAPABILITIES,
      completion: false,
    });

    expect(() => ensureLlmProviderCapability(provider, 'completion')).toThrow(InvalidInputError);
    expect(() => ensureLlmProviderCapability(provider, 'completion')).toThrow(
      'Provider type openai-compatible does not support completion.',
    );

    try {
      ensureLlmProviderCapability(provider, 'completion');
    } catch (error) {
      expect(error).toMatchObject({ code: LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE });
    }
  });

  it('fails unsupported streaming, model pull and embeddings with the stable code', () => {
    const provider = createProvider({
      ...CAPABILITIES,
      streaming: false,
      modelPulling: false,
      embeddings: false,
    });

    expect(() => ensureLlmProviderCapability(provider, 'streaming')).toThrow(
      'Provider type openai-compatible does not support streaming.',
    );
    expect(() => ensureLlmProviderCapability(provider, 'modelPulling')).toThrow(
      'Provider type openai-compatible does not support model pulling.',
    );
    expect(() => ensureLlmProviderCapability(provider, 'embeddings')).toThrow(
      'Provider type openai-compatible does not support embeddings.',
    );

    for (const capability of ['streaming', 'modelPulling', 'embeddings'] as const) {
      try {
        ensureLlmProviderCapability(provider, capability);
      } catch (error) {
        expect(error).toMatchObject({ code: LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE });
      }
    }
  });
});
