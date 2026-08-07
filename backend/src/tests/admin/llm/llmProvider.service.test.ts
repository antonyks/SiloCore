import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '../../../config/logger';
import { NotFoundError } from '../../../errors';
import { LlmProviderService } from '../../../modules/admin/llm/llmProvider.service';
import { LlmRuntimeService } from '../../../modules/llm/llmRuntime.service';
import { SelectedLlmProviderConfig } from '../../../modules/llm/llmProviderConfig.model';
import { OllamaProvider } from '../../../modules/llm/providers/ollama.provider';
import { mockPrisma } from '../../setup';

jest.mock('node-fetch', () => jest.fn());
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;
const SECOND_TEST_MODEL_ID = `${TEST_MODEL_ID}-secondary`;
const mockedLogger = logger as unknown as {
  info: jest.Mock;
  error: jest.Mock;
};

const OLLAMA_CAPABILITIES = {
  completion: true,
  streaming: true,
  reasoning: true,
  modelListing: true,
  modelPulling: true,
  embeddings: false,
  toolCalling: false,
  structuredOutput: false,
  tokenCounting: false,
};

const OPENAI_COMPATIBLE_CAPABILITIES = {
  completion: true,
  streaming: true,
  reasoning: true,
  modelListing: false,
  modelPulling: false,
  embeddings: false,
  toolCalling: false,
  structuredOutput: false,
  tokenCounting: false,
};

function createListedModel(modelName: string) {
  return {
    modelId: modelName,
    modelName,
    capabilities: {
      completion: 'UNKNOWN' as const,
      streaming: 'UNKNOWN' as const,
      reasoning: 'UNKNOWN' as const,
      embeddings: 'UNKNOWN' as const,
      toolCalling: 'UNKNOWN' as const,
      structuredOutput: 'UNKNOWN' as const,
      tokenCounting: 'UNKNOWN' as const,
    },
  };
}

function createProvider(overrides: Partial<SelectedLlmProviderConfig> = {}): SelectedLlmProviderConfig {
  return {
    id: 1,
    name: 'Local Ollama',
    type: 'OLLAMA',
    baseUrl: 'http://localhost:11434',
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

describe('LlmProviderService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('listProviders', () => {
    it('bootstraps the default Ollama provider when no configs exist', async () => {
      const provider = createProvider({ apiKey: null });

      mockPrisma.llmProviderConfig.count.mockResolvedValue(0);
      mockPrisma.llmProviderConfig.create.mockResolvedValue(provider);
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([provider]);

      const result = await LlmProviderService.listProviders();

      expect(mockPrisma.llmProviderConfig.create).toHaveBeenCalledWith({
        data: {
          name: 'Local Ollama',
          type: 'OLLAMA',
          baseUrl: expect.any(String),
          enabled: true,
          defaultModel: TEST_MODEL_ID,
          timeoutMs: null,
          generationDefaults: {},
          extraHeaders: undefined,
          apiKey: null,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual([
        expect.objectContaining({
          id: provider.id,
          type: 'ollama',
          hasApiKey: false,
          capabilities: OLLAMA_CAPABILITIES,
        }),
      ]);
      expect(result[0]).not.toHaveProperty('apiKey');
    });

    it('masks configured API keys in public results', async () => {
      const provider = createProvider();

      mockPrisma.llmProviderConfig.count.mockResolvedValue(1);
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([provider]);

      const result = await LlmProviderService.listProviders();

      expect(result[0]).toEqual(expect.objectContaining({ hasApiKey: true }));
      expect(result[0]).toEqual(expect.objectContaining({ capabilities: OLLAMA_CAPABILITIES }));
      expect(result[0]).not.toHaveProperty('apiKey');
    });

    it('returns OpenAI-compatible adapter capabilities', async () => {
      const provider = createProvider({
        type: 'OPENAI_COMPATIBLE',
        name: 'OpenAI Compatible',
      });

      mockPrisma.llmProviderConfig.count.mockResolvedValue(1);
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([provider]);

      const result = await LlmProviderService.listProviders();

      expect(result[0]).toEqual(expect.objectContaining({
        type: 'openai-compatible',
        capabilities: OPENAI_COMPATIBLE_CAPABILITIES,
      }));
      expect(result[0]).not.toHaveProperty('apiKey');
    });
  });

  describe('updateProvider', () => {
    it('passes null API keys through so admins can clear secrets', async () => {
      const provider = createProvider();
      const updated = createProvider({ apiKey: null });

      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(provider);
      mockPrisma.llmProviderConfig.update.mockResolvedValue(updated);

      const result = await LlmProviderService.updateProvider(provider.id, { apiKey: null });

      expect(mockPrisma.llmProviderConfig.update).toHaveBeenCalledWith({
        where: { id: provider.id },
        data: expect.objectContaining({ apiKey: null }),
        select: expect.any(Object),
      });
      expect(result.hasApiKey).toBe(false);
      expect(result.capabilities).toEqual(OLLAMA_CAPABILITIES);
    });
  });

  describe('deleteProvider', () => {
    it('soft deletes providers', async () => {
      const provider = createProvider();
      const deletedAt = new Date('2026-01-02T00:00:00.000Z');
      const deleted = createProvider({ enabled: false, deletedAt });

      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(provider);
      mockPrisma.llmProviderConfig.update.mockResolvedValue(deleted);

      const result = await LlmProviderService.deleteProvider(provider.id);

      expect(mockPrisma.llmProviderConfig.update).toHaveBeenCalledWith({
        where: { id: provider.id },
        data: expect.objectContaining({
          enabled: false,
          deletedAt: expect.any(Date),
        }),
        select: expect.any(Object),
      });
      expect(result.enabled).toBe(false);
      expect(result.deletedAt).toBe(deletedAt);
      expect(result.capabilities).toEqual(OLLAMA_CAPABILITIES);
    });

    it('rejects deleted providers as not found', async () => {
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProvider({ deletedAt: new Date() }));

      await expect(LlmProviderService.deleteProvider(1)).rejects.toThrow(NotFoundError);
    });
  });

  describe('provider operations', () => {
    it('tests openai-compatible providers without leaking secrets', async () => {
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProvider({
        type: 'OPENAI_COMPATIBLE',
        name: 'OpenAI Compatible',
      }));

      const result = await LlmProviderService.testProvider(1);

      expect(result).toEqual({
        providerId: '1',
        providerName: 'OpenAI Compatible',
        providerType: 'openai-compatible',
        status: 'success',
      });
      expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
        providerId: '1',
        providerType: 'openai-compatible',
        operation: 'provider.test',
        status: 'success',
      }), 'provider.test.success');
      expect(JSON.stringify([
        ...mockedLogger.info.mock.calls,
        ...mockedLogger.error.mock.calls,
      ])).not.toContain('secret-key');
    });

    it('lists models for Ollama providers without leaking secrets', async () => {
      const listModels = jest.spyOn(OllamaProvider.prototype, 'listModels')
        .mockResolvedValue([
          createListedModel(TEST_MODEL_ID),
          createListedModel(SECOND_TEST_MODEL_ID),
        ]);
      const provider = createProvider();

      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(provider);

      const result = await LlmRuntimeService.listProviderModels(provider.id);

      expect(listModels).toHaveBeenCalledTimes(1);
      expect(result.models).toEqual([
        expect.objectContaining({
          providerId: '1',
          modelId: TEST_MODEL_ID,
          capabilities: createListedModel(TEST_MODEL_ID).capabilities,
        }),
        expect.objectContaining({
          providerId: '1',
          modelId: SECOND_TEST_MODEL_ID,
          capabilities: createListedModel(SECOND_TEST_MODEL_ID).capabilities,
        }),
      ]);
      expect(result.providers).toEqual([
        expect.objectContaining({
          providerId: '1',
          status: 'success',
          modelCount: 2,
          capabilities: OLLAMA_CAPABILITIES,
        }),
      ]);
    });

    it('delegates model pull to Ollama providers', async () => {
      const pullModel = jest.spyOn(OllamaProvider.prototype, 'pullModel')
        .mockResolvedValue(undefined);
      const provider = createProvider();

      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(provider);

      const result = await LlmProviderService.pullProviderModel(provider.id, TEST_MODEL_ID);

      expect(pullModel).toHaveBeenCalledWith(TEST_MODEL_ID);
      expect(result).toEqual(expect.objectContaining({
        providerId: String(provider.id),
        status: 'success',
      }));
    });
  });
});
