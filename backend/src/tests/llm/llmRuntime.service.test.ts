import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { LlmRuntimeService } from '../../modules/llm/llmRuntime.service';
import { ILlmProvider } from '../../modules/llm/llm.interface';
import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmEmbeddingRequest,
  LlmEmbeddingResponse,
  LlmProviderCapabilities,
  LlmProviderConfig,
  LlmProviderListedModel,
  LlmStreamChunk,
} from '../../modules/llm/llm.types';
import { SelectedLlmProviderConfig } from '../../modules/llm/llmProviderConfig.model';
import { LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE } from '../../modules/llm/llm.capabilities';
import { mockPrisma } from '../setup';

jest.mock('node-fetch', () => jest.fn());

const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;

const UNSUPPORTED_EMBEDDING_CAPABILITIES: LlmProviderCapabilities = {
  completion: true,
  streaming: true,
  reasoning: false,
  modelListing: true,
  modelPulling: false,
  embeddings: false,
  toolCalling: false,
  structuredOutput: false,
  tokenCounting: false,
};

function createProviderConfig(overrides: Partial<SelectedLlmProviderConfig> = {}): SelectedLlmProviderConfig {
  return {
    id: 1,
    name: 'Provider',
    type: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://api.example.com/v1',
    enabled: true,
    defaultModel: TEST_MODEL_ID,
    timeoutMs: 5000,
    generationDefaults: {},
    extraHeaders: {},
    apiKey: 'secret-key',
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createRuntimeProvider(
  embed: jest.Mock<(request: LlmEmbeddingRequest) => Promise<LlmEmbeddingResponse>>,
): ILlmProvider {
  const config: LlmProviderConfig = {
    id: '1',
    name: 'Provider',
    type: 'openai-compatible',
    enabled: true,
    baseUrl: 'https://api.example.com/v1',
    defaultModel: TEST_MODEL_ID,
  };

  return {
    id: config.id,
    type: config.type,
    isEnabled: config.enabled,
    capabilities: UNSUPPORTED_EMBEDDING_CAPABILITIES,
    config,
    initialise: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    complete: jest.fn<(request: LlmCompletionRequest) => Promise<LlmCompletionResponse>>(),
    streamComplete: jest.fn<(request: LlmCompletionRequest) => AsyncIterable<LlmStreamChunk>>(),
    embed,
    listModels: jest.fn<() => Promise<LlmProviderListedModel[]>>().mockResolvedValue([]),
  };
}

describe('LlmRuntimeService embeddings', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails unsupported embeddings through the capability guard before invoking the adapter', async () => {
    const embed = jest.fn<(request: LlmEmbeddingRequest) => Promise<LlmEmbeddingResponse>>();
    jest.spyOn(LlmRuntimeService, 'createProvider').mockReturnValue(createRuntimeProvider(embed));
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProviderConfig());

    await expect(LlmRuntimeService.embedWithProvider({
      providerId: 1,
      request: {
        model: TEST_MODEL_ID,
        input: 'Private input',
      },
    })).rejects.toMatchObject({
      code: LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
      message: 'Provider type openai-compatible does not support embeddings.',
    });

    expect(embed).not.toHaveBeenCalled();
  });
});
