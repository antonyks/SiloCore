import type { LlmRuntimeServiceContract } from '../../llm/llmRuntime.service';
import { InvalidInputError } from '../../../errors';
import { LlmRuntimeService } from '../../llm/llmRuntime.service';
import { SelectedLlmProviderConfig } from '../../llm/llmProviderConfig.model';
import { LlmProviderConfigRepository } from '../../llm/llmProviderConfig.repository';
import { fromDbProviderType } from '../../llm/llmProviderConfig.types';
import { UNSUPPORTED_LLM_PROVIDER_CAPABILITIES } from '../../llm/llm.types';
import type { LlmProviderConfig } from '../../llm/llm.types';
import { ensureLlmProviderCapability } from '../../llm/llm.capabilities';
import { createLlmOperationContext, LlmOperationCorrelation } from '../../llm/llm.operation';
import { getPublicLlmErrorCode, getPublicLlmErrorMessage, normalizeAdapterError } from '../../llm/llm.safeError';
import {
  DraftProviderModelListResult,
  DraftProviderProbeInput,
  DraftProviderTestResult,
  LlmProviderCreateInput,
  LlmProviderUpdateInput,
  SanitizedLlmProviderConfig,
} from './llmProvider.types';

export interface LlmProviderServiceDependencies {
  llm: LlmRuntimeServiceContract;
  repository: typeof LlmProviderConfigRepository;
}

export function createLlmProviderService(dependencies: Partial<LlmProviderServiceDependencies> = {}) {
  const llm = dependencies.llm ?? LlmRuntimeService;
  const repository = dependencies.repository ?? LlmProviderConfigRepository;

  function sanitizeProvider(provider: SelectedLlmProviderConfig): SanitizedLlmProviderConfig {
    const adapter = llm.createProvider(provider);

    return {
      id: provider.id,
      name: provider.name,
      type: fromDbProviderType(provider.type),
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      isDefault: provider.isDefault,
      defaultSource: provider.defaultSource,
      defaultModel: provider.defaultModel,
      timeoutMs: provider.timeoutMs,
      generationDefaults: llm.normalizeGenerationDefaults(provider.generationDefaults),
      capabilities: adapter?.capabilities ?? UNSUPPORTED_LLM_PROVIDER_CAPABILITIES,
      extraHeaders: llm.normalizeExtraHeaders(provider.extraHeaders),
      hasApiKey: Boolean(provider.apiKey),
      deletedAt: provider.deletedAt,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  async function draftConfig(input: DraftProviderProbeInput, timeoutCap: number): Promise<LlmProviderConfig> {
    const saved = input.providerId === undefined ? null : await llm.getProviderConfigById(input.providerId);
    return {
      id: saved ? String(saved.id) : 'draft',
      name: saved?.name ?? 'Draft provider',
      type: input.type,
      enabled: true,
      baseUrl: input.baseUrl.trim(),
      apiKey: input.apiKey === undefined ? saved?.apiKey ?? undefined : input.apiKey ?? undefined,
      defaultModel: input.defaultModel?.trim() ?? saved?.defaultModel ?? '',
      timeoutMs: Math.min(input.timeoutMs ?? timeoutCap, timeoutCap),
      extraHeaders: input.extraHeaders ?? {},
      generationDefaults: {},
    };
  }

  function probeError(error: unknown, providerId: string) {
    const safeError = normalizeAdapterError(error, providerId);
    return {
      status: 'error' as const,
      errorMessage: getPublicLlmErrorMessage(safeError),
      errorCode: getPublicLlmErrorCode(safeError),
    };
  }

  const service = {
    async listProviders(): Promise<SanitizedLlmProviderConfig[]> {
      await llm.ensureBootstrapProviderConfig();
      await repository.getOrSelectDefault();
      const providers = await repository.findAll();
      return providers.map(sanitizeProvider);
    },

    async getProvider(id: number): Promise<SanitizedLlmProviderConfig> {
      const provider = await llm.getProviderConfigById(id);
      return sanitizeProvider(provider);
    },

    async previewProviderModels(input: DraftProviderProbeInput, correlation: LlmOperationCorrelation = {}): Promise<DraftProviderModelListResult> {
      const config = await draftConfig(input, 15000);
      let adapter;
      try {
        adapter = llm.createProviderFromConfig(config);
        if (!adapter) return { status: 'error', models: [], errorMessage: 'No adapter is available for this provider type', errorCode: 'ADAPTER_UNAVAILABLE' };
        ensureLlmProviderCapability(adapter, 'modelListing');
        const models = await adapter.listModels(createLlmOperationContext(correlation));
        return {
          status: 'success',
          models: models
            .filter((model) => typeof model.modelId === 'string' && model.modelId.trim().length > 0)
            .map(({ modelId, modelName }) => ({
              modelId,
              modelName: typeof modelName === 'string' && modelName.trim() ? modelName : modelId,
            })),
        };
      } catch (error) {
        return { ...probeError(error, config.id), models: [] };
      } finally {
        await adapter?.destroy().catch(() => undefined);
      }
    },

    async previewProviderModelTest(input: DraftProviderProbeInput, correlation: LlmOperationCorrelation = {}): Promise<DraftProviderTestResult> {
      const config = await draftConfig(input, 120000);
      let adapter;
      try {
        adapter = llm.createProviderFromConfig(config);
        if (!adapter) return { status: 'error', errorMessage: 'No adapter is available for this provider type', errorCode: 'ADAPTER_UNAVAILABLE' };
        ensureLlmProviderCapability(adapter, 'completion');
        const result = await adapter.complete({
          model: config.defaultModel,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          maxTokens: 128,
        }, createLlmOperationContext(correlation));
        if (!result.content?.trim() && !result.reasoning?.trim()) {
          return { status: 'error', errorMessage: 'Provider returned an empty response' };
        }
        return { status: 'success' };
      } catch (error) {
        return probeError(error, config.id);
      } finally {
        await adapter?.destroy().catch(() => undefined);
      }
    },

    async createProvider(data: LlmProviderCreateInput): Promise<SanitizedLlmProviderConfig> {
      const provider = await repository.create(data);
      await repository.getOrSelectDefault();
      return sanitizeProvider((await repository.findById(provider.id)) ?? provider);
    },

    async setDefaultProvider(id: number): Promise<SanitizedLlmProviderConfig> {
      const provider = await llm.getProviderConfigById(id);
      if (!provider.enabled) throw new InvalidInputError('LLM provider is disabled');
      const selected = await repository.setDefault(id);
      if (!selected) throw new InvalidInputError('LLM provider cannot be made default');
      return sanitizeProvider(selected);
    },

    async updateProvider(id: number, data: LlmProviderUpdateInput): Promise<SanitizedLlmProviderConfig> {
      await llm.getProviderConfigById(id);
      const provider = await repository.update(id, data);
      return sanitizeProvider(provider);
    },

    async deleteProvider(id: number): Promise<SanitizedLlmProviderConfig> {
      await llm.getProviderConfigById(id);
      const provider = await repository.softDelete(id);
      return sanitizeProvider(provider);
    },

    testProvider: llm.testProvider.bind(llm),

    pullProviderModel: llm.pullProviderModel.bind(llm),
  };

  return service;
}

export type LlmProviderServiceContract = ReturnType<typeof createLlmProviderService>;
export const LlmProviderService = createLlmProviderService();
