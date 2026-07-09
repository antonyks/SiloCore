import { LlmGenerationDefaults, LlmProviderType } from '../../llm/llm.types';
import {
  LlmProviderConfigCreateInput,
  LlmProviderConfigUpdateInput,
} from '../../llm/llmProviderConfig.types';

export type LlmProviderCreateInput = LlmProviderConfigCreateInput;
export type LlmProviderUpdateInput = LlmProviderConfigUpdateInput;

export interface SanitizedLlmProviderConfig {
  id: number;
  name: string;
  type: LlmProviderType;
  baseUrl: string;
  enabled: boolean;
  defaultModel: string;
  timeoutMs: number | null;
  generationDefaults: LlmGenerationDefaults;
  extraHeaders: Record<string, string>;
  hasApiKey: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
