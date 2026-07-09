import { ILlmProvider } from './llm.interface';
import {
  LlmListedModel,
  LlmModelListResult,
  LlmProviderModelListResult,
} from './llm.types';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}

export class LlmRegistryService {
  constructor(private readonly providers: ILlmProvider[]) {}

  async listAvailableModels(): Promise<LlmModelListResult> {
    const providerResults = await Promise.all(
      this.providers.map((provider) => this.listProviderModels(provider)),
    );

    return {
      models: providerResults.flatMap((result) => result.models),
      providers: providerResults.map((result) => result.provider),
    };
  }

  private async listProviderModels(provider: ILlmProvider): Promise<{
    models: LlmListedModel[];
    provider: LlmProviderModelListResult;
  }> {
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
      return {
        models: [],
        provider: {
          ...baseProviderResult,
          status: 'skipped',
          modelCount: 0,
        },
      };
    }

    try {
      const modelNames = await provider.listModels();
      const models = modelNames.map((modelName) => ({
        ...baseModelResult,
        modelId: modelName,
        modelName,
      }));

      return {
        models,
        provider: {
          ...baseProviderResult,
          status: 'success',
          modelCount: models.length,
        },
      };
    } catch (error) {
      return {
        models: [],
        provider: {
          ...baseProviderResult,
          status: 'error',
          modelCount: 0,
          errorMessage: getErrorMessage(error),
        },
      };
    }
  }
}
