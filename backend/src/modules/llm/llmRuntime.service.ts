import { ENV } from '../../config/env';
import { NotFoundError } from '../../errors';
import { ILlmProvider } from './llm.interface';
import { LlmProviderConfigRepository } from './llmProviderConfig.repository';
import { fromDbProviderType } from './llmProviderConfig.types';
import { SelectedLlmProviderConfig } from './llmProviderConfig.model';
import { LlmRegistryService } from './llm.service';
import {
  LlmModelListResult,
  LlmProviderConfig,
  LlmProviderOperationResult,
  LlmProviderType,
} from './llm.types';
import { OllamaProvider } from './providers/ollama.provider';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}

function normalizeExtraHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((headers, [key, headerValue]) => {
    if (typeof headerValue === 'string') {
      headers[key] = headerValue;
    }
    return headers;
  }, {});
}

function toProviderConfig(provider: SelectedLlmProviderConfig): LlmProviderConfig {
  return {
    id: String(provider.id),
    name: provider.name,
    type: fromDbProviderType(provider.type),
    enabled: provider.enabled && !provider.deletedAt,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? undefined,
    defaultModel: provider.defaultModel,
    timeoutMs: provider.timeoutMs ?? undefined,
    extraHeaders: normalizeExtraHeaders(provider.extraHeaders),
  };
}

function createAdapter(config: LlmProviderConfig): ILlmProvider | null {
  if (config.type === 'ollama') {
    return new OllamaProvider(config);
  }

  return null;
}

function adapterUnavailable(config: LlmProviderConfig): LlmProviderOperationResult {
  return {
    providerId: config.id,
    providerName: config.name,
    providerType: config.type,
    status: 'error',
    errorMessage: `No adapter is available for provider type ${config.type}`,
  };
}

function toProviderModelListResult(result: LlmProviderOperationResult) {
  return {
    providerId: result.providerId,
    providerName: result.providerName,
    providerType: result.providerType,
    status: result.status,
    modelCount: 0,
    errorMessage: result.errorMessage,
  };
}

export const LlmRuntimeService = {
  normalizeExtraHeaders,

  toProviderConfig,

  async ensureBootstrapProviderConfig(): Promise<void> {
    const count = await LlmProviderConfigRepository.countActive();
    if (count > 0) return;

    await LlmProviderConfigRepository.create({
      name: 'Local Ollama',
      type: 'ollama',
      baseUrl: ENV.OLLAMA_HOST,
      enabled: true,
      defaultModel: ENV.OLLAMA_MODEL,
    });
  },

  async getProviderConfigById(id: number): Promise<SelectedLlmProviderConfig> {
    const provider = await LlmProviderConfigRepository.findById(id);
    if (!provider || provider.deletedAt) {
      throw new NotFoundError('LLM provider config not found');
    }
    return provider;
  },

  createProvider(provider: SelectedLlmProviderConfig): ILlmProvider | null {
    return createAdapter(toProviderConfig(provider));
  },

  async listAvailableModels(): Promise<LlmModelListResult> {
    const providers = await LlmProviderConfigRepository.findActive();
    const adapters = providers.map((provider) => {
      const config = toProviderConfig(provider);
      const adapter = createAdapter(config);

      if (adapter) return adapter;

      return {
        id: config.id,
        type: config.type,
        isEnabled: config.enabled,
        capabilities: {
          supportsStreaming: false,
          supportsSystemMessages: false,
          supportsToolCalls: false,
          supportsVision: false,
        },
        config,
        initialise: async () => undefined,
        destroy: async () => undefined,
        complete: async () => {
          throw new Error(`No adapter is available for provider type ${config.type}`);
        },
        streamComplete: async function* () {
          throw new Error(`No adapter is available for provider type ${config.type}`);
        },
        listModels: async () => {
          throw new Error(`No adapter is available for provider type ${config.type}`);
        },
      } satisfies ILlmProvider;
    });

    return new LlmRegistryService(adapters).listAvailableModels();
  },

  async listProviderModels(id: number): Promise<LlmModelListResult> {
    const provider = await this.getProviderConfigById(id);
    const config = toProviderConfig(provider);
    const adapter = createAdapter(config);

    if (!adapter) {
      const unavailable = adapterUnavailable(config);
      return {
        models: [],
        providers: [toProviderModelListResult(unavailable)],
      };
    }

    return new LlmRegistryService([adapter]).listAvailableModels();
  },

  async testProvider(id: number): Promise<LlmProviderOperationResult> {
    const provider = await this.getProviderConfigById(id);
    const config = toProviderConfig(provider);
    const adapter = createAdapter(config);

    if (!adapter) {
      return adapterUnavailable(config);
    }

    try {
      await adapter.initialise();
      return {
        providerId: adapter.id,
        providerName: adapter.config.name,
        providerType: adapter.config.type,
        status: 'success',
      };
    } catch (error) {
      return {
        providerId: adapter.id,
        providerName: adapter.config.name,
        providerType: adapter.config.type,
        status: 'error',
        errorMessage: getErrorMessage(error),
      };
    }
  },

  async pullProviderModel(id: number, model: string): Promise<LlmProviderOperationResult> {
    const provider = await this.getProviderConfigById(id);
    const config = toProviderConfig(provider);
    const adapter = createAdapter(config);

    if (!adapter) {
      return adapterUnavailable(config);
    }

    if (!adapter.pullModel) {
      return {
        providerId: adapter.id,
        providerName: adapter.config.name,
        providerType: adapter.config.type,
        status: 'error',
        errorMessage: `Provider type ${adapter.config.type} does not support model pull`,
      };
    }

    try {
      await adapter.pullModel(model);
      return {
        providerId: adapter.id,
        providerName: adapter.config.name,
        providerType: adapter.config.type,
        status: 'success',
      };
    } catch (error) {
      return {
        providerId: adapter.id,
        providerName: adapter.config.name,
        providerType: adapter.config.type,
        status: 'error',
        errorMessage: getErrorMessage(error),
      };
    }
  },
};

export type { LlmProviderType };
