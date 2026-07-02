import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { InvalidInputError } from '../../errors';
import { LlmController } from '../../modules/llm/llm.controller';
import { SelectedLlmProviderConfig } from '../../modules/llm/llmProviderConfig.model';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';
import { createAuthenticatedMockRequest, createMockResponse } from '../testUtils';
import { mockPrisma } from '../setup';

jest.mock('node-fetch', () => jest.fn());

const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;

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

describe('LlmController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns common model listing without provider secrets or config-only fields', async () => {
    jest.spyOn(OllamaProvider.prototype, 'listModels')
      .mockResolvedValue([TEST_MODEL_ID]);
    const provider = createProvider();
    mockPrisma.llmProviderConfig.count.mockResolvedValue(1);
    mockPrisma.llmProviderConfig.findMany.mockResolvedValue([provider]);
    const res = createMockResponse();

    await LlmController.listAvailableModels(createAuthenticatedMockRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: {
        models: [
          expect.objectContaining({
            providerId: '1',
            providerType: 'ollama',
            modelId: TEST_MODEL_ID,
          }),
        ],
        providers: [
          expect.objectContaining({
            providerId: '1',
            providerType: 'ollama',
            status: 'success',
            modelCount: 1,
          }),
        ],
      },
    });

    const responseBody = res.json.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(JSON.stringify(responseBody.data)).not.toContain('secret-key');
    expect(JSON.stringify(responseBody.data)).not.toContain('apiKey');
  });

  it('returns provider-specific model listing without provider secrets or config-only fields', async () => {
    jest.spyOn(OllamaProvider.prototype, 'listModels')
      .mockResolvedValue([TEST_MODEL_ID]);
    const provider = createProvider();
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(provider);
    const res = createMockResponse();

    await LlmController.listProviderModels(createAuthenticatedMockRequest({
      params: { id: String(provider.id) },
    }), res);

    expect(mockPrisma.llmProviderConfig.findUnique).toHaveBeenCalledWith({
      where: { id: provider.id },
      select: expect.any(Object),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: {
        models: [
          expect.objectContaining({
            providerId: '1',
            providerType: 'ollama',
            modelId: TEST_MODEL_ID,
          }),
        ],
        providers: [
          expect.objectContaining({
            providerId: '1',
            providerType: 'ollama',
            status: 'success',
            modelCount: 1,
          }),
        ],
      },
    });

    const responseBody = res.json.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(JSON.stringify(responseBody.data)).not.toContain('secret-key');
    expect(JSON.stringify(responseBody.data)).not.toContain('apiKey');
  });

  it('throws InvalidInputError for invalid provider-specific model listing id', async () => {
    const res = createMockResponse();

    await expect(LlmController.listProviderModels(createAuthenticatedMockRequest({
      params: { id: 'not-a-number' },
    }), res)).rejects.toThrow(
      new InvalidInputError("The ID parameter 'not-a-number' is not a valid number."),
    );
  });
});
