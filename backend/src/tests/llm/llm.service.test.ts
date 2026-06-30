import { jest } from '@jest/globals';
import { ILlmProvider } from '../../modules/llm/llm.interface';
import { LlmRegistryService } from '../../modules/llm/llm.service';
import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProviderCapabilities,
  LlmProviderConfig,
  LlmStreamChunk,
} from '../../modules/llm/llm.types';

const DEFAULT_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsSystemMessages: true,
  supportsToolCalls: false,
  supportsVision: false,
};

function createProvider(
  config: Partial<LlmProviderConfig> & Pick<LlmProviderConfig, 'id' | 'name' | 'type'>,
  listModels: jest.Mock<() => Promise<string[]>>,
): ILlmProvider {
  const fullConfig: LlmProviderConfig = {
    enabled: true,
    baseUrl: `http://${config.id}.local`,
    defaultModel: 'default-model',
    ...config,
  };

  return {
    id: fullConfig.id,
    type: fullConfig.type,
    isEnabled: fullConfig.enabled,
    capabilities: DEFAULT_CAPABILITIES,
    config: fullConfig,
    initialise: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    complete: jest.fn<(request: LlmCompletionRequest) => Promise<LlmCompletionResponse>>(),
    streamComplete: jest.fn<(request: LlmCompletionRequest) => AsyncIterable<LlmStreamChunk>>(),
    listModels,
  };
}

describe('LlmRegistryService', () => {
  it('aggregates provider-qualified models from multiple enabled providers', async () => {
    const ollamaListModels = jest.fn<() => Promise<string[]>>().mockResolvedValue(['llama2', 'mistral']);
    const cloudListModels = jest.fn<() => Promise<string[]>>().mockResolvedValue(['gpt-local']);
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
        modelId: 'llama2',
        modelName: 'llama2',
      },
      {
        providerId: 'ollama',
        providerName: 'Local Ollama',
        providerType: 'ollama',
        modelId: 'mistral',
        modelName: 'mistral',
      },
      {
        providerId: 'cloud',
        providerName: 'Cloud Provider',
        providerType: 'openai-compatible',
        modelId: 'gpt-local',
        modelName: 'gpt-local',
      },
    ]);
    expect(result.providers).toEqual([
      {
        providerId: 'ollama',
        providerName: 'Local Ollama',
        providerType: 'ollama',
        status: 'success',
        modelCount: 2,
      },
      {
        providerId: 'cloud',
        providerName: 'Cloud Provider',
        providerType: 'openai-compatible',
        status: 'success',
        modelCount: 1,
      },
    ]);
  });

  it('skips disabled providers without calling listModels', async () => {
    const disabledListModels = jest.fn<() => Promise<string[]>>().mockResolvedValue(['disabled-model']);
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
          status: 'skipped',
          modelCount: 0,
        },
      ],
    });
  });

  it('returns partial model results when one provider fails', async () => {
    const successfulListModels = jest.fn<() => Promise<string[]>>().mockResolvedValue(['llama2']);
    const failingListModels = jest.fn<() => Promise<string[]>>().mockRejectedValue(new Error('provider offline'));
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
        modelId: 'llama2',
        modelName: 'llama2',
      },
    ]);
    expect(result.providers).toEqual([
      {
        providerId: 'ollama',
        providerName: 'Local Ollama',
        providerType: 'ollama',
        status: 'success',
        modelCount: 1,
      },
      {
        providerId: 'broken',
        providerName: 'Broken Provider',
        providerType: 'openai-compatible',
        status: 'error',
        modelCount: 0,
        errorMessage: 'provider offline',
      },
    ]);
  });

  it('returns an empty model list when no enabled provider succeeds', async () => {
    const failingListModels = jest.fn<() => Promise<string[]>>().mockRejectedValue('offline');
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
          status: 'error',
          modelCount: 0,
          errorMessage: 'Unknown provider error',
        },
      ],
    });
  });
});
