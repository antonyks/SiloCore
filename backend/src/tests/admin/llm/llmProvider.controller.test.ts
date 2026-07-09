import { describe, expect, it } from '@jest/globals';
import { InvalidInputError } from '../../../errors';
import { LlmProviderController } from '../../../modules/admin/llm/llmProvider.controller';
import { SelectedLlmProviderConfig } from '../../../modules/llm/llmProviderConfig.model';
import { createAuthenticatedMockRequest, createMockResponse } from '../../testUtils';
import { mockPrisma } from '../../setup';

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
    generationDefaults: {},
    extraHeaders: {},
    apiKey: 'secret-key',
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('LlmProviderController', () => {
  it('creates a provider and returns sanitized data', async () => {
    const provider = createProvider();
    mockPrisma.llmProviderConfig.create.mockResolvedValue(provider);
    const res = createMockResponse();

    await LlmProviderController.createProvider(
      createAuthenticatedMockRequest({
        body: {
          name: provider.name,
          type: 'ollama',
          baseUrl: provider.baseUrl,
          defaultModel: provider.defaultModel,
          apiKey: provider.apiKey,
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: provider.id,
        hasApiKey: true,
      }),
    });
    const responseBody = res.json.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(responseBody.data).not.toHaveProperty('apiKey');
  });

  it('lists providers and triggers bootstrap when needed', async () => {
    const provider = createProvider({ apiKey: null });
    mockPrisma.llmProviderConfig.count.mockResolvedValue(0);
    mockPrisma.llmProviderConfig.create.mockResolvedValue(provider);
    mockPrisma.llmProviderConfig.findMany.mockResolvedValue([provider]);
    const res = createMockResponse();

    await LlmProviderController.listProviders(createAuthenticatedMockRequest(), res);

    expect(mockPrisma.llmProviderConfig.create).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [expect.objectContaining({ id: provider.id, hasApiKey: false })],
    });
  });

  it('updates a provider by id', async () => {
    const provider = createProvider();
    const updated = createProvider({ name: 'Renamed Ollama' });
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(provider);
    mockPrisma.llmProviderConfig.update.mockResolvedValue(updated);
    const res = createMockResponse();

    await LlmProviderController.updateProvider(
      createAuthenticatedMockRequest({
        params: { id: '1' },
        body: { name: 'Renamed Ollama' },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Renamed Ollama' }),
    });
  });

  it('throws InvalidInputError for invalid provider id params', async () => {
    const res = createMockResponse();

    await expect(LlmProviderController.getProvider(
      createAuthenticatedMockRequest({ params: { id: 'abc' } }),
      res,
    )).rejects.toThrow(InvalidInputError);
  });

  it('soft deletes a provider by id', async () => {
    const provider = createProvider();
    const deleted = createProvider({ enabled: false, deletedAt: new Date('2026-01-02T00:00:00.000Z') });
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(provider);
    mockPrisma.llmProviderConfig.update.mockResolvedValue(deleted);
    const res = createMockResponse();

    await LlmProviderController.deleteProvider(
      createAuthenticatedMockRequest({ params: { id: '1' } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enabled: false,
        deletedAt: deleted.deletedAt,
      }),
    });
  });

});
