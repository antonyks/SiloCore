import type { ProviderHealthSampleServiceContract } from '../providerHealthSample/providerHealthSample.service';
import { ENV } from '../../config/env';
import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';
import { InvalidInputError, NotFoundError } from '../../errors';
import { ILlmProvider } from './llm.interface';
import { LlmProviderConfigRepository } from './llmProviderConfig.repository';
import { fromDbProviderType, toDbProviderType } from './llmProviderConfig.types';
import { SelectedLlmProviderConfig } from './llmProviderConfig.model';
import { LlmRegistryService } from './llm.service';
import {
  ensureLlmProviderCapability,
  LlmProviderCapability,
} from './llm.capabilities';
import {
  LlmModelListResult,
  LlmEmbeddingRequest,
  LlmEmbeddingResponse,
  LlmGenerationDefaults,
  LlmProviderConfig,
  LlmProviderOperationResult,
  LlmStreamChunk,
  LlmProviderType,
  UNSUPPORTED_LLM_PROVIDER_CAPABILITIES,
  LlmProviderModelListResult,
} from './llm.types';
import { coreProviderFactories, ProviderAdapterFactories } from '../../composition/providerAdapters';
import { getLlmErrorCode, logLlmEvent } from './llm.logging';
import { createLlmOperationContext, LlmOperationContext, LlmOperationCorrelation } from './llm.operation';
import { getPublicLlmErrorCode, getPublicLlmErrorMessage, normalizeAdapterError } from './llm.safeError';
import {
  ProviderHealthSampleOperation,
  ProviderHealthSampleService,
  ProviderHealthSampleStatus,
} from '../providerHealthSample';

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeGenerationDefaults(value: unknown): LlmGenerationDefaults {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const data = value as Record<string, unknown>;
  const defaults: LlmGenerationDefaults = {};

  if (isFiniteNumber(data.temperature) && data.temperature >= 0) {
    defaults.temperature = data.temperature;
  }

  if (isFiniteNumber(data.topP) && data.topP >= 0 && data.topP <= 1) {
    defaults.topP = data.topP;
  }

  if (Number.isInteger(data.maxTokens) && Number(data.maxTokens) > 0) {
    defaults.maxTokens = Number(data.maxTokens);
  }

  if (Array.isArray(data.stopSequences)) {
    const stopSequences = data.stopSequences.filter(
      (sequence): sequence is string => typeof sequence === 'string',
    );
    if (stopSequences.length > 0) {
      defaults.stopSequences = stopSequences;
    }
  }

  return defaults;
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
    generationDefaults: normalizeGenerationDefaults(provider.generationDefaults),
    extraHeaders: normalizeExtraHeaders(provider.extraHeaders),
  };
}

export interface LlmRuntimeServiceDependencies {
  adapterFactories: ProviderAdapterFactories;
  repository: typeof LlmProviderConfigRepository;
  healthSamples: ProviderHealthSampleServiceContract;
}

export function createLlmRuntimeService(dependencies: Partial<LlmRuntimeServiceDependencies> = {}) {
  const adapterFactories = dependencies.adapterFactories ?? coreProviderFactories;
  const repository = dependencies.repository ?? LlmProviderConfigRepository;
  const healthSamples = dependencies.healthSamples ?? ProviderHealthSampleService;

  function createAdapter(config: LlmProviderConfig): ILlmProvider | null {
    try {
      return adapterFactories[config.type]?.(config) ?? null;
    } catch (error) {
      throw normalizeAdapterError(error, config.id);
    }
  }

  function adapterUnavailable(config: LlmProviderConfig, context: LlmOperationContext): LlmProviderOperationResult {
    logLlmEvent({
      layer: 'runtime',
      ...context,
      providerId: config.id,
      providerType: config.type,
      operation: 'provider.adapterUnavailable',
      status: 'error',
      errorCode: 'ADAPTER_UNAVAILABLE',
    });

    return {
      providerId: config.id,
      providerName: config.name,
      providerType: config.type,
      status: 'error',
      errorMessage: `No adapter is available for provider type ${config.type}`,
      errorCode: 'ADAPTER_UNAVAILABLE',
    };
  }

  function toProviderModelListResult(result: LlmProviderOperationResult) {
    return {
      providerId: result.providerId,
      providerName: result.providerName,
      providerType: result.providerType,
      generationDefaults: {},
      status: result.status,
      modelCount: 0,
      capabilities: UNSUPPORTED_LLM_PROVIDER_CAPABILITIES,
      errorMessage: result.errorMessage,
      errorCode: result.errorCode,
    };
  }

  function createFailingStream(error: Error): AsyncIterable<LlmStreamChunk> {
    const iterator: AsyncIterator<LlmStreamChunk> = {
      next: async () => Promise.reject(error),
    };

    return {
      [Symbol.asyncIterator]: () => iterator,
    };
  }

  const service = {
    normalizeExtraHeaders,

    normalizeGenerationDefaults,

    toProviderConfig,

    async ensureBootstrapProviderConfig(): Promise<void> {
      const count = await repository.countActive();
      if (count > 0) return;

      await repository.create({
        name: 'Local Ollama',
        type: 'ollama',
        baseUrl: ENV.OLLAMA_HOST,
        enabled: true,
        defaultModel: ENV.OLLAMA_MODEL,
      });
    },

    async getProviderConfigById(id: number): Promise<SelectedLlmProviderConfig> {
      const provider = await repository.findById(id);
      if (!provider || provider.deletedAt) {
        throw new NotFoundError('LLM provider config not found');
      }
      return provider;
    },

    createProvider(provider: SelectedLlmProviderConfig): ILlmProvider | null {
      return createAdapter(toProviderConfig(provider));
    },

    createProviderFromConfig(config: LlmProviderConfig): ILlmProvider | null {
      return createAdapter(config);
    },

    async listAvailableModels(correlation: LlmOperationCorrelation = {}): Promise<LlmModelListResult> {
      const providers = await repository.findActive();
      const unavailableProviderIds = new Set<string>();
      const adapters = providers.map((provider) => {
        const config = toProviderConfig(provider);
        const adapter = createAdapter(config);

        if (adapter) return adapter;
        unavailableProviderIds.add(config.id);

        return {
          id: config.id,
          type: config.type,
          isEnabled: config.enabled,
          capabilities: UNSUPPORTED_LLM_PROVIDER_CAPABILITIES,
          config,
          initialise: async () => undefined,
          destroy: async () => undefined,
          complete: async () => {
            throw new Error(`No adapter is available for provider type ${config.type}`);
          },
          streamComplete: () => createFailingStream(
            new Error(`No adapter is available for provider type ${config.type}`),
          ),
          embed: async () => {
            throw new Error(`No adapter is available for provider type ${config.type}`);
          },
          listModels: async () => {
            throw new Error(`No adapter is available for provider type ${config.type}`);
          },
        } satisfies ILlmProvider;
      });

      const result = await new LlmRegistryService(adapters, (observation) => {
        if (observation.provider.status === 'error'
          && unavailableProviderIds.has(observation.provider.providerId)) {
          logLlmEvent({
            layer: 'runtime',
            ...observation.context,
            providerId: observation.provider.providerId,
            providerType: observation.provider.providerType,
            operation: 'provider.adapterUnavailable',
            status: 'error',
            errorCode: 'ADAPTER_UNAVAILABLE',
          });
        }
        return recordModelRegistrySampleSafely(
          observation.provider,
          observation.latencyMs,
          observation.context,
        );
      }).listAvailableModels(correlation);
      const defaultProvider = providers.find((provider) => provider.isDefault) ?? providers[0];
      const defaultModel = defaultProvider && result.models.find((model) =>
        model.providerId === String(defaultProvider.id)
        && model.modelId.toLowerCase() === defaultProvider.defaultModel.toLowerCase(),
      );

      return {
        ...result,
        ...(defaultModel ? { defaultModelName: defaultModel.modelName } : {}),
      };
    },

    async listProviderModels(id: number, correlation: LlmOperationCorrelation = {}): Promise<LlmModelListResult> {
      const provider = await this.getProviderConfigById(id);
      const config = toProviderConfig(provider);
      const adapter = createAdapter(config);
      const startedAt = Date.now();

      if (!adapter) {
        const context = createLlmOperationContext(correlation);
        const unavailable = adapterUnavailable(config, context);
        const providerResult = toProviderModelListResult(unavailable);
        await recordModelRegistrySampleSafely(providerResult, Date.now() - startedAt, context);
        return {
          models: [],
          providers: [providerResult],
        };
      }

      return new LlmRegistryService([adapter], (observation) => recordModelRegistrySampleSafely(
        observation.provider,
        observation.latencyMs,
        observation.context,
      )).listAvailableModels(correlation);
    },

    async testProvider(id: number, correlation: LlmOperationCorrelation = {}): Promise<LlmProviderOperationResult> {
      const provider = await this.getProviderConfigById(id);
      const config = toProviderConfig(provider);
      const adapter = createAdapter(config);
      const startedAt = Date.now();
      const context = createLlmOperationContext(correlation);

      if (!adapter) {
        const result = adapterUnavailable(config, context);
        await recordProviderOperationSampleSafely(result, Date.now() - startedAt, context);
        return result;
      }

      logLlmEvent({
        layer: 'runtime',
        ...context,
        providerId: adapter.id,
        providerType: adapter.config.type,
        operation: 'provider.test',
        status: 'started',
      });

      try {
        await adapter.initialise(context);
        logLlmEvent({
          layer: 'runtime',
          ...context,
          providerId: adapter.id,
          providerType: adapter.config.type,
          operation: 'provider.test',
          latencyMs: Date.now() - startedAt,
          status: 'success',
        });
        const result: LlmProviderOperationResult = {
          providerId: adapter.id,
          providerName: adapter.config.name,
          providerType: adapter.config.type,
          status: 'success',
        };
        await recordProviderOperationSampleSafely(result, Date.now() - startedAt, context);
        return result;
      } catch (error) {
        const safeError = normalizeAdapterError(error, adapter.id);
        logLlmEvent({
          layer: 'runtime',
          ...context,
          providerId: adapter.id,
          providerType: adapter.config.type,
          operation: 'provider.test',
          latencyMs: Date.now() - startedAt,
          status: 'error',
          errorCode: getLlmErrorCode(safeError),
          ...safeErrorDiagnostic(error),
        });
        const result: LlmProviderOperationResult = {
          providerId: adapter.id,
          providerName: adapter.config.name,
          providerType: adapter.config.type,
          status: 'error',
          errorMessage: getPublicLlmErrorMessage(safeError),
          errorCode: getPublicLlmErrorCode(safeError),
        };
        await recordProviderOperationSampleSafely(result, Date.now() - startedAt, context);
        return result;
      }
    },

    async pullProviderModel(id: number, model: string, correlation: LlmOperationCorrelation = {}): Promise<LlmProviderOperationResult> {
      const provider = await this.getProviderConfigById(id);
      const config = toProviderConfig(provider);
      const adapter = createAdapter(config);
      const startedAt = Date.now();
      const context = createLlmOperationContext(correlation);

      if (!adapter) {
        return adapterUnavailable(config, context);
      }

      try {
        ensureLlmProviderCapability(adapter, 'modelPulling');
      } catch (error) {
        const safeError = normalizeAdapterError(error, adapter.id);
        logLlmEvent({
          layer: 'runtime', ...context,
          providerId: adapter.id, providerType: adapter.config.type, model,
          operation: 'provider.pullModel.runtime', status: 'error',
          errorCode: getLlmErrorCode(safeError), ...safeErrorDiagnostic(error),
        });
        return {
          providerId: adapter.id,
          providerName: adapter.config.name,
          providerType: adapter.config.type,
          status: 'error',
          errorMessage: getPublicLlmErrorMessage(safeError),
          errorCode: getPublicLlmErrorCode(safeError),
        };
      }

      if (!adapter.pullModel) {
        logLlmEvent({
          layer: 'runtime', ...context,
          providerId: adapter.id, providerType: adapter.config.type, model,
          operation: 'provider.pullModel.runtime', status: 'error',
          errorCode: 'LLM_PROVIDER_CAPABILITY_UNSUPPORTED',
        });
        return {
          providerId: adapter.id,
          providerName: adapter.config.name,
          providerType: adapter.config.type,
          status: 'error',
          errorMessage: `Provider type ${adapter.config.type} does not support model pull`,
          errorCode: 'LLM_PROVIDER_CAPABILITY_UNSUPPORTED',
        };
      }

      logLlmEvent({
        layer: 'runtime',
        ...context,
        providerId: adapter.id,
        providerType: adapter.config.type,
        model,
        operation: 'provider.pullModel.runtime',
        status: 'started',
      });

      try {
        await adapter.pullModel(model, context);
        logLlmEvent({
          layer: 'runtime',
          ...context,
          providerId: adapter.id,
          providerType: adapter.config.type,
          model,
          operation: 'provider.pullModel.runtime',
          latencyMs: Date.now() - startedAt,
          status: 'success',
        });
        return {
          providerId: adapter.id,
          providerName: adapter.config.name,
          providerType: adapter.config.type,
          status: 'success',
        };
      } catch (error) {
        const safeError = normalizeAdapterError(error, adapter.id);
        logLlmEvent({
          layer: 'runtime',
          ...context,
          providerId: adapter.id,
          providerType: adapter.config.type,
          model,
          operation: 'provider.pullModel.runtime',
          latencyMs: Date.now() - startedAt,
          status: 'error',
          errorCode: getLlmErrorCode(safeError),
          ...safeErrorDiagnostic(error),
        });
        return {
          providerId: adapter.id,
          providerName: adapter.config.name,
          providerType: adapter.config.type,
          status: 'error',
          errorMessage: getPublicLlmErrorMessage(safeError),
          errorCode: getPublicLlmErrorCode(safeError),
        };
      }
    },

    async embedWithProvider(params: {
      providerId: number;
      request: LlmEmbeddingRequest;
      correlation?: LlmOperationCorrelation;
    }): Promise<LlmEmbeddingResponse> {
      const providerConfig = await this.getProviderConfigById(params.providerId);

      if (!providerConfig.enabled) {
        throw new InvalidInputError('LLM provider is disabled');
      }

      const provider = this.createProvider(providerConfig);
      if (!provider) {
        throw new InvalidInputError(`No adapter is available for provider type ${fromDbProviderType(providerConfig.type)}`);
      }

      try {
        ensureLlmProviderCapability(provider, 'embeddings');
      } catch (error) {
        throw normalizeAdapterError(error, provider.id);
      }

      try {
        return await provider.embed(params.request, createLlmOperationContext(params.correlation));
      } catch (error) {
        throw normalizeAdapterError(error, provider.id);
      }
    },

    async resolveGenerationProvider(params: {
      providerId?: number;
      model?: string;
      operation?: Extract<LlmProviderCapability, 'completion' | 'streaming'>;
    }): Promise<{
      providerConfig: SelectedLlmProviderConfig;
      provider: ILlmProvider;
      model: string;
      generationDefaults: LlmGenerationDefaults;
    }> {
      const providerConfig = params.providerId === undefined
        ? await repository.getOrSelectDefault()
        : await repository.findById(params.providerId);

      if (!providerConfig || providerConfig.deletedAt) {
        throw new NotFoundError('LLM provider config not found');
      }

      if (!providerConfig.enabled) {
        throw new InvalidInputError('LLM provider is disabled');
      }

      const provider = this.createProvider(providerConfig);
      if (!provider) {
        throw new InvalidInputError(`No adapter is available for provider type ${fromDbProviderType(providerConfig.type)}`);
      }

      const operation = params.operation ?? 'completion';
      try {
        ensureLlmProviderCapability(provider, operation);
      } catch (error) {
        throw normalizeAdapterError(error, provider.id);
      }

      return {
        providerConfig,
        provider,
        model: params.model ?? providerConfig.defaultModel,
        generationDefaults: normalizeGenerationDefaults(providerConfig.generationDefaults),
      };
    },

    async listFallbackProviderIds(currentId: number): Promise<number[]> {
      const active = await repository.findActive();
      const index = active.findIndex((provider) => provider.id === currentId);
      if (index < 0) return [];
      return [...active.slice(index + 1), ...active.slice(0, index)].map((provider) => provider.id);
    },

    promoteDefaultProvider(fromId: number, toId: number): Promise<boolean> {
      return repository.promoteDefault(fromId, toId);
    },
  };

  async function recordModelRegistrySampleSafely(
    provider: LlmProviderModelListResult,
    latencyMs: number,
    context: LlmOperationContext,
  ): Promise<void> {
    await recordProviderSampleSafely({
      providerId: Number(provider.providerId),
      providerType: toDbProviderType(provider.providerType),
      operation: ProviderHealthSampleOperation.MODEL_REGISTRY,
      status: toProviderHealthSampleStatus(provider.status),
      latencyMs,
      modelCount: provider.modelCount,
      errorCode: provider.errorCode,
    }, context);
  }

  async function recordProviderOperationSampleSafely(
    result: LlmProviderOperationResult,
    latencyMs: number,
    context: LlmOperationContext,
  ): Promise<void> {
    await recordProviderSampleSafely({
      providerId: Number(result.providerId),
      providerType: toDbProviderType(result.providerType),
      operation: ProviderHealthSampleOperation.PROVIDER_TEST,
      status: toProviderHealthSampleStatus(result.status),
      latencyMs,
      errorCode: result.errorCode,
    }, context);
  }

  async function recordProviderSampleSafely(input: Parameters<
    typeof healthSamples.recordSample
  >[0], context: LlmOperationContext): Promise<void> {
    if (!Number.isInteger(input.providerId)) return;

    try {
      await healthSamples.recordSample(input);
    } catch (error) {
      logLlmEvent({
        layer: 'runtime',
        ...context,
        providerId: String(input.providerId),
        providerType: fromDbProviderType(input.providerType),
        operation: 'providerHealthSample.record',
        status: 'error',
        errorCode: 'PROVIDER_HEALTH_SAMPLE_RECORD_FAILED',
        sampleOperation: input.operation,
        sampleStatus: input.status,
        sampleErrorCode: input.errorCode,
        ...safeErrorDiagnostic(error),
      });
    }
  }

  function toProviderHealthSampleStatus(
    status: LlmProviderModelListResult['status'],
  ): ProviderHealthSampleStatus {
    if (status === 'success') return ProviderHealthSampleStatus.SUCCESS;
    if (status === 'skipped') return ProviderHealthSampleStatus.SKIPPED;
    return ProviderHealthSampleStatus.ERROR;
  }

  return service;
}

export type LlmRuntimeServiceContract = ReturnType<typeof createLlmRuntimeService>;
export const LlmRuntimeService = createLlmRuntimeService();
export type { LlmProviderType };
