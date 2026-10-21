import fetch, { Response } from 'node-fetch';
import {
  LlmProviderConfigType,
  ProviderHealthSampleOperation,
  ProviderHealthSampleStatus,
} from '@prisma/client';
import { describe, expect, it, jest, afterEach, beforeEach } from '@jest/globals';
import { InvalidInputError } from '../../errors';
import { logger } from '../../config/logger';
import { createLlmRuntimeService, LlmRuntimeService } from '../../modules/llm/llmRuntime.service';
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
import { LlmProviderConfigRepository } from '../../modules/llm/llmProviderConfig.repository';
import { LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE } from '../../modules/llm/llm.capabilities';
import { mockPrisma } from '../setup';

jest.mock('node-fetch', () => jest.fn());

const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

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

function mockModelListResponse(modelIds = [TEST_MODEL_ID]): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      object: 'list',
      data: modelIds.map((id) => ({ id, object: 'model' })),
    }),
    text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
  } as unknown as Response;
}

describe('LlmRuntimeService embeddings', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

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

  it('normalizes private validation text thrown while creating an adapter', async () => {
    const service = createLlmRuntimeService({
      repository: {
        ...LlmProviderConfigRepository,
        findById: async () => createProviderConfig(),
      },
      adapterFactories: {
        'openai-compatible': () => {
          throw new InvalidInputError('Bearer private-token; prompt: private chat');
        },
      },
    });

    await expect(service.resolveGenerationProvider({ providerId: 1 })).rejects.toMatchObject({
      message: 'Provider rejected the request',
      code: 'PROVIDER_INVALID_REQUEST',
    });
  });

  it('normalizes private validation text thrown by an embedding adapter', async () => {
    const embed = jest.fn<(request: LlmEmbeddingRequest) => Promise<LlmEmbeddingResponse>>()
      .mockRejectedValue(new InvalidInputError('Bearer private-token; prompt: private chat'));
    const provider = createRuntimeProvider(embed);
    provider.capabilities.embeddings = true;
    jest.spyOn(LlmRuntimeService, 'createProvider').mockReturnValue(provider);
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProviderConfig());

    await expect(LlmRuntimeService.embedWithProvider({
      providerId: 1,
      request: { model: TEST_MODEL_ID, input: 'Private input' },
    })).rejects.toMatchObject({
      message: 'Provider rejected the request',
      code: 'PROVIDER_INVALID_REQUEST',
    });
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('records provider health samples for single-provider model registry requests', async () => {
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProviderConfig({
      id: 7,
      type: LlmProviderConfigType.OPENAI_COMPATIBLE,
    }));
    mockPrisma.providerHealthSample.create.mockResolvedValue({
      id: 1,
      providerId: 7,
      providerType: LlmProviderConfigType.OPENAI_COMPATIBLE,
      operation: ProviderHealthSampleOperation.MODEL_REGISTRY,
      status: ProviderHealthSampleStatus.SUCCESS,
      latencyMs: 3,
      modelCount: 2,
      errorCode: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    mockedFetch.mockResolvedValue(mockModelListResponse([
      TEST_MODEL_ID,
      `${TEST_MODEL_ID}-secondary`,
    ]));

    await expect(LlmRuntimeService.listProviderModels(7)).resolves.toMatchObject({
      providers: [
        {
          providerId: '7',
          status: 'success',
          modelCount: 2,
        },
      ],
    });

    expect(mockPrisma.providerHealthSample.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: 7,
        providerType: LlmProviderConfigType.OPENAI_COMPATIBLE,
        operation: ProviderHealthSampleOperation.MODEL_REGISTRY,
        status: ProviderHealthSampleStatus.SUCCESS,
        modelCount: 2,
        errorCode: undefined,
      }),
      select: expect.any(Object),
    });
  });

  it('records provider health samples for explicit provider tests', async () => {
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProviderConfig({
      id: 8,
      type: LlmProviderConfigType.OPENAI_COMPATIBLE,
    }));
    mockPrisma.providerHealthSample.create.mockResolvedValue({
      id: 2,
      providerId: 8,
      providerType: LlmProviderConfigType.OPENAI_COMPATIBLE,
      operation: ProviderHealthSampleOperation.PROVIDER_TEST,
      status: ProviderHealthSampleStatus.SUCCESS,
      latencyMs: 5,
      modelCount: null,
      errorCode: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    mockedFetch.mockResolvedValue(mockModelListResponse());

    await expect(LlmRuntimeService.testProvider(8)).resolves.toMatchObject({
      providerId: '8',
      status: 'success',
    });

    expect(mockPrisma.providerHealthSample.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: 8,
        providerType: LlmProviderConfigType.OPENAI_COMPATIBLE,
        operation: ProviderHealthSampleOperation.PROVIDER_TEST,
        status: ProviderHealthSampleStatus.SUCCESS,
        errorCode: undefined,
      }),
      select: expect.any(Object),
    });
  });

  it('links a failed health-sample write to the provider operation without logging the database error text', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const errors = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProviderConfig({ id: 7 }));
    mockPrisma.providerHealthSample.create.mockRejectedValue(new Error('Bearer private database detail'));
    mockedFetch.mockResolvedValue(mockModelListResponse());

    await expect(LlmRuntimeService.listProviderModels(7, { requestId: 'req-sample-failure' }))
      .resolves.toMatchObject({ providers: [expect.objectContaining({ status: 'success' })] });

    const providerStart = info.mock.calls
      .map(([payload]) => payload as Record<string, unknown>)
      .find((payload) => payload.operation === 'provider.listModels' && payload.status === 'started');
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({
      layer: 'runtime', operation: 'providerHealthSample.record', status: 'error',
      requestId: 'req-sample-failure', operationId: providerStart?.operationId,
      errorCode: 'PROVIDER_HEALTH_SAMPLE_RECORD_FAILED', failureKind: 'Error',
      sampleOperation: ProviderHealthSampleOperation.MODEL_REGISTRY,
      sampleStatus: ProviderHealthSampleStatus.SUCCESS,
    }), 'providerHealthSample.record.error');
    expect(JSON.stringify(errors.mock.calls)).not.toContain('private database detail');
  });

  it.each([
    [{ requestId: 'req-unavailable' }],
    [{ jobId: 42 }],
  ])('correlates unavailable-adapter and failed-sample events for %p', async (correlation) => {
    const errors = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const repository = {
      ...LlmProviderConfigRepository,
      findActive: async () => [createProviderConfig({ id: 7 })],
    };
    const recordSample = jest.fn(async () => { throw new Error('Bearer private database detail'); });
    const runtime = createLlmRuntimeService({
      repository,
      adapterFactories: {},
      healthSamples: { recordSample },
    });

    const result = await runtime.listAvailableModels(correlation);

    expect(result.providers[0]).toMatchObject({
      status: 'error', errorCode: LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
    });
    const logged = errors.mock.calls.map(([payload]) => payload as Record<string, unknown>);
    const registry = logged.find((entry) => entry.operation === 'provider.modelRegistry');
    const unavailable = logged.find((entry) => entry.operation === 'provider.adapterUnavailable');
    const sampleFailure = logged.find((entry) => entry.operation === 'providerHealthSample.record');
    expect(registry).toMatchObject({
      ...correlation, providerId: '7', status: 'error',
      errorCode: LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
      operationId: expect.any(String),
    });
    expect(unavailable).toMatchObject({
      ...correlation, providerId: '7', errorCode: 'ADAPTER_UNAVAILABLE',
      operationId: registry?.operationId,
    });
    expect(sampleFailure).toMatchObject({
      ...correlation, providerId: '7', operationId: registry?.operationId,
      errorCode: 'PROVIDER_HEALTH_SAMPLE_RECORD_FAILED',
      sampleOperation: ProviderHealthSampleOperation.MODEL_REGISTRY,
      sampleStatus: ProviderHealthSampleStatus.ERROR,
      sampleErrorCode: LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
    });
    expect(recordSample).toHaveBeenCalledWith(expect.objectContaining({
      operation: ProviderHealthSampleOperation.MODEL_REGISTRY,
      status: ProviderHealthSampleStatus.ERROR,
      errorCode: LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
    }));
    expect(JSON.stringify(errors.mock.calls)).not.toContain('private database detail');
  });
});
