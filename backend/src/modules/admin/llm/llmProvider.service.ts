import { LlmRuntimeService } from '../../llm/llmRuntime.service';
import { SelectedLlmProviderConfig } from '../../llm/llmProviderConfig.model';
import { LlmProviderConfigRepository } from '../../llm/llmProviderConfig.repository';
import { fromDbProviderType } from '../../llm/llmProviderConfig.types';
import {
  LlmProviderCreateInput,
  LlmProviderUpdateInput,
  SanitizedLlmProviderConfig,
} from './llmProvider.types';

function sanitizeProvider(provider: SelectedLlmProviderConfig): SanitizedLlmProviderConfig {
  return {
    id: provider.id,
    name: provider.name,
    type: fromDbProviderType(provider.type),
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    defaultModel: provider.defaultModel,
    timeoutMs: provider.timeoutMs,
    extraHeaders: LlmRuntimeService.normalizeExtraHeaders(provider.extraHeaders),
    hasApiKey: Boolean(provider.apiKey),
    deletedAt: provider.deletedAt,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

export const LlmProviderService = {
  async listProviders(): Promise<SanitizedLlmProviderConfig[]> {
    await LlmRuntimeService.ensureBootstrapProviderConfig();
    const providers = await LlmProviderConfigRepository.findAll();
    return providers.map(sanitizeProvider);
  },

  async getProvider(id: number): Promise<SanitizedLlmProviderConfig> {
    const provider = await LlmRuntimeService.getProviderConfigById(id);
    return sanitizeProvider(provider);
  },

  async createProvider(data: LlmProviderCreateInput): Promise<SanitizedLlmProviderConfig> {
    const provider = await LlmProviderConfigRepository.create(data);
    return sanitizeProvider(provider);
  },

  async updateProvider(id: number, data: LlmProviderUpdateInput): Promise<SanitizedLlmProviderConfig> {
    await LlmRuntimeService.getProviderConfigById(id);
    const provider = await LlmProviderConfigRepository.update(id, data);
    return sanitizeProvider(provider);
  },

  async deleteProvider(id: number): Promise<SanitizedLlmProviderConfig> {
    await LlmRuntimeService.getProviderConfigById(id);
    const provider = await LlmProviderConfigRepository.softDelete(id);
    return sanitizeProvider(provider);
  },

  testProvider: LlmRuntimeService.testProvider.bind(LlmRuntimeService),

  pullProviderModel: LlmRuntimeService.pullProviderModel.bind(LlmRuntimeService),
};
