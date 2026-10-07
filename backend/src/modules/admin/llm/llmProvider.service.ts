import type { LlmRuntimeServiceContract } from '../../llm/llmRuntime.service';
import { LlmRuntimeService } from '../../llm/llmRuntime.service';
import { SelectedLlmProviderConfig } from '../../llm/llmProviderConfig.model';
import { LlmProviderConfigRepository } from '../../llm/llmProviderConfig.repository';
import { fromDbProviderType } from '../../llm/llmProviderConfig.types';
import { UNSUPPORTED_LLM_PROVIDER_CAPABILITIES } from '../../llm/llm.types';
import {
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

  const service = {
    async listProviders(): Promise<SanitizedLlmProviderConfig[]> {
      await llm.ensureBootstrapProviderConfig();
      const providers = await repository.findAll();
      return providers.map(sanitizeProvider);
    },

    async getProvider(id: number): Promise<SanitizedLlmProviderConfig> {
      const provider = await llm.getProviderConfigById(id);
      return sanitizeProvider(provider);
    },

    async createProvider(data: LlmProviderCreateInput): Promise<SanitizedLlmProviderConfig> {
      const provider = await repository.create(data);
      return sanitizeProvider(provider);
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
