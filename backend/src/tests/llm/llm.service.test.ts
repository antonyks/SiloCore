import { jest } from '@jest/globals';
import { logger } from '../../config/logger';
import { InvalidInputError } from '../../errors';
import { ILlmProvider } from '../../modules/llm/llm.interface';
import {
  LlmProviderModelListObserver,
  LlmRegistryService,
} from '../../modules/llm/llm.service';
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

const DEFAULT_CAPABILITIES: LlmProviderCapabilities = {
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
const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;
const SECOND_TEST_MODEL_ID = `${TEST_MODEL_ID}-secondary`;
const CLOUD_TEST_MODEL_ID = `${TEST_MODEL_ID}-cloud`;
const DISABLED_TEST_MODEL_ID = `${TEST_MODEL_ID}-disabled`;

function createProvider(
  config: Partial<LlmProviderConfig> & Pick<LlmProviderConfig, 'id' | 'name' | 'type'>,
  listModels: jest.Mock<() => Promise<LlmProviderListedModel[]>>,
  capabilities: LlmProviderCapabilities = DEFAULT_CAPABILITIES,
): ILlmProvider {
  const fullConfig: LlmProviderConfig = {
    enabled: true,
    baseUrl: `http://${config.id}.local`,
    defaultModel: TEST_MODEL_ID,
    ...config,
  };

  return {
    id: fullConfig.id,
    type: fullConfig.type,
    isEnabled: fullConfig.enabled,
    capabilities,
    config: fullConfig,
    initialise: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    complete: jest.fn<(request: LlmCompletionRequest) => Promise<LlmCompletionResponse>>(),
    streamComplete: jest.fn<(request: LlmCompletionRequest) => AsyncIterable<LlmStreamChunk>>(),
    embed: jest.fn<(request: LlmEmbeddingRequest) => Promise<LlmEmbeddingResponse>>(),
    listModels,
  };
}

function createListedModel(modelName: string): LlmProviderListedModel {
  return {
    modelId: modelName,
    modelName,
    capabilities: {
      completion: 'UNKNOWN',
      streaming: 'UNKNOWN',
      reasoning: 'UNKNOWN',
      embeddings: 'UNKNOWN',
      toolCalling: 'UNKNOWN',
      structuredOutput: 'UNKNOWN',
      tokenCounting: 'UNKNOWN',
    },
  };
}

describe('LlmRegistryService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses distinct child operation IDs and one request ID for a provider fan-out', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const first = jest.fn<ILlmProvider['listModels']>().mockResolvedValue([]);
    const second = jest.fn<ILlmProvider['listModels']>().mockResolvedValue([]);
    const observer = jest.fn<LlmProviderModelListObserver>();
    const service = new LlmRegistryService([
      createProvider({ id: 'ollama', name: 'Local Ollama', type: 'ollama' }, first),
      createProvider({ id: 'cloud', name: 'Cloud', type: 'openai-compatible' }, second),
    ], observer);

    await service.listAvailableModels({ requestId: 'registry-request' });

    const firstContext = first.mock.calls[0][0];
    const secondContext = second.mock.calls[0][0];
    expect(firstContext).toMatchObject({ requestId: 'registry-request', operationId: expect.any(String) });
    expect(secondContext).toMatchObject({ requestId: 'registry-request', operationId: expect.any(String) });
    expect(firstContext?.operationId).not.toBe(secondContext?.operationId);
    expect(observer.mock.calls.map(([observation]) => observation.context.operationId))
      .toEqual([firstContext?.operationId, secondContext?.operationId]);
    const registryEvents = info.mock.calls
      .map(([payload]) => payload as Record<string, unknown>)
      .filter((payload) => payload.operation === 'provider.modelRegistry');
    expect(registryEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requestId: 'registry-request', providerId: 'ollama', status: 'success',
        operationId: firstContext?.operationId,
      }),
      expect.objectContaining({
        requestId: 'registry-request', providerId: 'cloud', status: 'success',
        operationId: secondContext?.operationId,
      }),
    ]));
  });

  it('aggregates provider-qualified models from multiple enabled providers', async () => {
    const ollamaListModels = jest.fn<() => Promise<LlmProviderListedModel[]>>().mockResolvedValue([
      createListedModel(TEST_MODEL_ID),
      createListedModel(SECOND_TEST_MODEL_ID),
    ]);
    const cloudListModels = jest.fn<() => Promise<LlmProviderListedModel[]>>().mockResolvedValue([
      createListedModel(CLOUD_TEST_MODEL_ID),
    ]);
    const service = new LlmRegistryService([
      createProvider({ id: 'ollama', name: 'Local Ollama', type: 'ollama' }, ollamaListModels),
      createProvider({ id: 'cloud', name: 'Cloud Provider', type: 'openai-compatible' }, cloudListModels),
    ]);

    const result = await service.listAvailableModels();

    expect(result.models).toEqual([
      {
        providerId: 'ollama',
        providerName: 'Local Ollama',
        providerType: 'ollama',
        modelId: TEST_MODEL_ID,
        modelName: TEST_MODEL_ID,
        capabilities: createListedModel(TEST_MODEL_ID).capabilities,
      },
      {
        providerId: 'ollama',
        providerName: 'Local Ollama',
        providerType: 'ollama',
        modelId: SECOND_TEST_MODEL_ID,
        modelName: SECOND_TEST_MODEL_ID,
        capabilities: createListedModel(SECOND_TEST_MODEL_ID).capabilities,
      },
      {
        providerId: 'cloud',
        providerName: 'Cloud Provider',
        providerType: 'openai-compatible',
        modelId: CLOUD_TEST_MODEL_ID,
        modelName: CLOUD_TEST_MODEL_ID,
        capabilities: createListedModel(CLOUD_TEST_MODEL_ID).capabilities,
      },
    ]);
    expect(result.providers).toEqual([
      {
        providerId: 'ollama',
        providerName: 'Local Ollama',
        providerType: 'ollama',
        generationDefaults: {},
        status: 'success',
        modelCount: 2,
        capabilities: DEFAULT_CAPABILITIES,
      },
      {
        providerId: 'cloud',
        providerName: 'Cloud Provider',
        providerType: 'openai-compatible',
        generationDefaults: {},
        status: 'success',
        modelCount: 1,
        capabilities: DEFAULT_CAPABILITIES,
      },
    ]);
  });

  it('skips disabled providers without calling listModels', async () => {
    const disabledListModels = jest.fn<() => Promise<LlmProviderListedModel[]>>().mockResolvedValue([
      createListedModel(DISABLED_TEST_MODEL_ID),
    ]);
    const service = new LlmRegistryService([
      createProvider(
        { id: 'disabled', name: 'Disabled Provider', type: 'ollama', enabled: false },
        disabledListModels,
      ),
    ]);

    const result = await service.listAvailableModels();

    expect(disabledListModels).not.toHaveBeenCalled();
    expect(result).toEqual({
      models: [],
      providers: [
        {
          providerId: 'disabled',
          providerName: 'Disabled Provider',
          providerType: 'ollama',
          generationDefaults: {},
          status: 'skipped',
          modelCount: 0,
          capabilities: DEFAULT_CAPABILITIES,
        },
      ],
    });
  });

  it('returns partial model results when one provider fails', async () => {
    const successfulListModels = jest.fn<() => Promise<LlmProviderListedModel[]>>().mockResolvedValue([
      createListedModel(TEST_MODEL_ID),
    ]);
    const upstreamError = Object.assign(new Error('Authorization: Bearer private-api-key'), {
      code: 'PRIVATE_API_KEY',
    });
    const failingListModels = jest.fn<() => Promise<LlmProviderListedModel[]>>().mockRejectedValue(upstreamError);
    const service = new LlmRegistryService([
      createProvider({ id: 'ollama', name: 'Local Ollama', type: 'ollama' }, successfulListModels),
      createProvider({ id: 'broken', name: 'Broken Provider', type: 'openai-compatible' }, failingListModels),
    ]);

    const result = await service.listAvailableModels();

    expect(result.models).toEqual([
      {
        providerId: 'ollama',
        providerName: 'Local Ollama',
        providerType: 'ollama',
        modelId: TEST_MODEL_ID,
        modelName: TEST_MODEL_ID,
        capabilities: createListedModel(TEST_MODEL_ID).capabilities,
      },
    ]);
    expect(result.providers).toEqual([
      {
        providerId: 'ollama',
        providerName: 'Local Ollama',
        providerType: 'ollama',
        generationDefaults: {},
        status: 'success',
        modelCount: 1,
        capabilities: DEFAULT_CAPABILITIES,
      },
      {
        providerId: 'broken',
        providerName: 'Broken Provider',
        providerType: 'openai-compatible',
        generationDefaults: {},
        status: 'error',
        modelCount: 0,
        capabilities: DEFAULT_CAPABILITIES,
        errorMessage: 'Provider operation failed',
      },
    ]);
  });

  it('does not expose adapter validation text in model-list results', async () => {
    const listModels = jest.fn<() => Promise<LlmProviderListedModel[]>>()
      .mockRejectedValue(new InvalidInputError('Bearer private-token; prompt: private chat'));
    const service = new LlmRegistryService([
      createProvider({ id: 'broken', name: 'Broken Provider', type: 'ollama' }, listModels),
    ]);

    const result = await service.listAvailableModels();

    expect(result.providers[0]).toEqual(expect.objectContaining({
      status: 'error',
      errorMessage: 'Provider rejected the request',
      errorCode: 'PROVIDER_INVALID_REQUEST',
    }));
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(JSON.stringify(result)).not.toContain('private chat');
  });

  it('fails unsupported model listing before calling the provider', async () => {
    const errors = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const unsupportedCapabilities = {
      ...DEFAULT_CAPABILITIES,
      modelListing: false,
    };
    const listModels = jest.fn<() => Promise<LlmProviderListedModel[]>>().mockResolvedValue([
      createListedModel(TEST_MODEL_ID),
    ]);
    const service = new LlmRegistryService([
      createProvider(
        { id: 'cloud', name: 'Cloud Provider', type: 'openai-compatible' },
        listModels,
        unsupportedCapabilities,
      ),
    ]);

    const result = await service.listAvailableModels();

    expect(listModels).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'provider.modelRegistry', status: 'error', providerId: 'cloud',
      errorCode: 'LLM_PROVIDER_CAPABILITY_UNSUPPORTED', operationId: expect.any(String),
    }), 'provider.modelRegistry.error');
    expect(result).toEqual({
      models: [],
      providers: [
        {
          providerId: 'cloud',
          providerName: 'Cloud Provider',
          providerType: 'openai-compatible',
          generationDefaults: {},
          status: 'error',
          modelCount: 0,
          capabilities: unsupportedCapabilities,
          errorMessage: 'Provider type openai-compatible does not support model listing.',
          errorCode: 'LLM_PROVIDER_CAPABILITY_UNSUPPORTED',
        },
      ],
    });
  });

  it('returns an empty model list when no enabled provider succeeds', async () => {
    const failingListModels = jest.fn<() => Promise<LlmProviderListedModel[]>>().mockRejectedValue('offline');
    const service = new LlmRegistryService([
      createProvider({ id: 'broken', name: 'Broken Provider', type: 'ollama' }, failingListModels),
    ]);

    const result = await service.listAvailableModels();

    expect(result).toEqual({
      models: [],
      providers: [
        {
          providerId: 'broken',
          providerName: 'Broken Provider',
          providerType: 'ollama',
          generationDefaults: {},
          status: 'error',
          modelCount: 0,
          capabilities: DEFAULT_CAPABILITIES,
          errorMessage: 'Provider operation failed',
        },
      ],
    });
  });

  it('observes each provider listing result without changing the response shape', async () => {
    const listModels = jest.fn<() => Promise<LlmProviderListedModel[]>>().mockResolvedValue([
      createListedModel(TEST_MODEL_ID),
    ]);
    const observer = jest.fn<LlmProviderModelListObserver>();
    const service = new LlmRegistryService([
      createProvider({ id: 'ollama', name: 'Local Ollama', type: 'ollama' }, listModels),
    ], observer);

    const result = await service.listAvailableModels();

    expect(result.providers).toEqual([
      expect.objectContaining({
        providerId: 'ollama',
        status: 'success',
        modelCount: 1,
      }),
    ]);
    expect(observer).toHaveBeenCalledWith({
      provider: expect.objectContaining({
        providerId: 'ollama',
        status: 'success',
        modelCount: 1,
      }),
      latencyMs: expect.any(Number),
      context: expect.objectContaining({ operationId: expect.any(String) }),
    });
  });
});
