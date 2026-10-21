import { ILlmProvider } from './llm.interface';
import { ensureLlmProviderCapability } from './llm.capabilities';
import { getPublicLlmErrorCode, getPublicLlmErrorMessage, normalizeAdapterError } from './llm.safeError';
import { createLlmOperationContext, LlmOperationContext, LlmOperationCorrelation } from './llm.operation';
import { logLlmEvent } from './llm.logging';
import {
  LlmListedModel,
  LlmModelListResult,
  LlmProviderModelListResult,
} from './llm.types';

export interface LlmProviderModelListObservation {
  provider: LlmProviderModelListResult;
  latencyMs: number;
  context: LlmOperationContext;
}

export type LlmProviderModelListObserver = (
  observation: LlmProviderModelListObservation,
) => Promise<void> | void;

export class LlmRegistryService {
  constructor(
    private readonly providers: ILlmProvider[],
    private readonly observer?: LlmProviderModelListObserver,
  ) {}

  async listAvailableModels(correlation: LlmOperationCorrelation = {}): Promise<LlmModelListResult> {
    const providerResults = await Promise.all(
      this.providers.map((provider) => this.listProviderModels(provider, createLlmOperationContext(correlation))),
    );

    return {
      models: providerResults.flatMap((result) => result.models),
      providers: providerResults.map((result) => result.provider),
    };
  }

  private async listProviderModels(provider: ILlmProvider, context: LlmOperationContext): Promise<{
    models: LlmListedModel[];
    provider: LlmProviderModelListResult;
  }> {
    const startedAt = Date.now();
    const baseModelResult = {
      providerId: provider.id,
      providerName: provider.config.name,
      providerType: provider.config.type,
    };
    const baseProviderResult = {
      ...baseModelResult,
      generationDefaults: provider.config.generationDefaults ?? {},
    };

    if (!provider.isEnabled) {
      return this.observeProviderResult({
        models: [],
        provider: {
          ...baseProviderResult,
          status: 'skipped',
          modelCount: 0,
          capabilities: provider.capabilities,
        },
      }, startedAt, context);
    }

    try {
      ensureLlmProviderCapability(provider, 'modelListing');
      const listedModels = await provider.listModels(context);
      const models = listedModels.map((model) => ({
        ...baseModelResult,
        modelId: model.modelId,
        modelName: model.modelName,
        capabilities: model.capabilities,
      }));

      return this.observeProviderResult({
        models,
        provider: {
          ...baseProviderResult,
          status: 'success',
          modelCount: models.length,
          capabilities: provider.capabilities,
        },
      }, startedAt, context);
    } catch (error) {
      const safeError = normalizeAdapterError(error, provider.id);
      return this.observeProviderResult({
        models: [],
        provider: {
          ...baseProviderResult,
          status: 'error',
          modelCount: 0,
          capabilities: provider.capabilities,
          errorMessage: getPublicLlmErrorMessage(safeError),
          errorCode: getPublicLlmErrorCode(safeError),
        },
      }, startedAt, context);
    }
  }

  private async observeProviderResult(result: {
    models: LlmListedModel[];
    provider: LlmProviderModelListResult;
  }, startedAt: number, context: LlmOperationContext): Promise<{
    models: LlmListedModel[];
    provider: LlmProviderModelListResult;
  }> {
    const latencyMs = Date.now() - startedAt;
    logLlmEvent({
      layer: 'runtime',
      ...context,
      providerId: result.provider.providerId,
      providerType: result.provider.providerType,
      operation: 'provider.modelRegistry',
      status: result.provider.status,
      latencyMs,
      errorCode: result.provider.errorCode,
    });

    if (this.observer) {
      await this.observer({
        provider: result.provider,
        latencyMs,
        context,
      });
    }

    return result;
  }
}
