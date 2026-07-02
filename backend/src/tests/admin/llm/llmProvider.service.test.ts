import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundError } from '../../../errors';
import { LlmProviderService } from '../../../modules/admin/llm/llmProvider.service';
import { LlmRuntimeService } from '../../../modules/llm/llmRuntime.service';
import { SelectedLlmProviderConfig } from '../../../modules/llm/llmProviderConfig.model';
import { OllamaProvider } from '../../../modules/llm/providers/ollama.provider';
import { mockPrisma } from '../../setup';

jest.mock('node-fetch', () => jest.fn());

const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;
const SECOND_TEST_MODEL_ID = `${TEST_MODEL_ID}-secondary`;

function createProvider(overrides: Partial<SelectedLlmProviderConfig> = {}): SelectedLlmProviderConfig {
  return {
    id: 1,
    name: 'Local Ollama',
    type: 'OLLAMA',
    baseUrl: 'http://localhost:11434',
    enabled: true,
    defaultModel: TEST_MODEL_ID,
    timeoutMs: 5000,
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
    });

    it('rejects deleted providers as not found', async () => {
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProvider({ deletedAt: new Date() }));

      await expect(LlmProviderService.deleteProvider(1)).rejects.toThrow(NotFoundError);
    });
  });

  describe('provider operations', () => {
    it('returns adapter unavailable for openai-compatible provider operations', async () => {
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProvider({
        type: 'OPENAI_COMPATIBLE',
        name: 'OpenAI Compatible',
      }));

      const result = await LlmProviderService.testProvider(1);

      expect(result).toEqual({
        providerId: '1',
        providerName: 'OpenAI Compatible',
        providerType: 'openai-compatible',
        status: 'error',
        errorMessage: 'No adapter is available for provider type openai-compatible',
      });
    });

    it('lists models for Ollama providers without leaking secrets', async () => {
      const listModels = jest.spyOn(OllamaProvider.prototype, 'listModels')
        .mockResolvedValue([TEST_MODEL_ID, SECOND_TEST_MODEL_ID]);
      const provider = createProvider();

      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(provider);

      const result = await LlmRuntimeService.listProviderModels(provider.id);

      expect(listModels).toHaveBeenCalledTimes(1);
      expect(result.models).toEqual([
        expect.objectContaining({ providerId: '1', modelId: TEST_MODEL_ID }),
        expect.objectContaining({ providerId: '1', modelId: SECOND_TEST_MODEL_ID }),
      ]);
      expect(result.providers).toEqual([
        expect.objectContaining({
          providerId: '1',
          status: 'success',
          modelCount: 2,
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
