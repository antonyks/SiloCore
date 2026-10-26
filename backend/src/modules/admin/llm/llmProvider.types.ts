import { LlmGenerationDefaults, LlmProviderCapabilities, LlmProviderType } from '../../llm/llm.types';
import {
  LlmProviderConfigCreateInput,
  LlmProviderConfigUpdateInput,
} from '../../llm/llmProviderConfig.types';

export type LlmProviderCreateInput = LlmProviderConfigCreateInput;
export type LlmProviderUpdateInput = LlmProviderConfigUpdateInput;

export interface DraftProviderProbeInput {
  providerId?: number;
  type: LlmProviderType;
  baseUrl: string;
  timeoutMs?: number | null;
  extraHeaders?: Record<string, string>;
  apiKey?: string | null;
  defaultModel?: string;
}

export interface DraftProviderModelListResult {
  status: 'success' | 'error';
  models: Array<{ modelId: string; modelName: string }>;
  errorMessage?: string;
  errorCode?: string;
}

export interface DraftProviderTestResult {
  status: 'success' | 'error';
  errorMessage?: string;
  errorCode?: string;
}

export interface SanitizedLlmProviderConfig {
  id: number;
  name: string;
  type: LlmProviderType;
  baseUrl: string;
  enabled: boolean;
  isDefault: boolean;
  defaultSource: 'ADMIN' | 'AUTO' | null;
  defaultModel: string;
  timeoutMs: number | null;
  generationDefaults: LlmGenerationDefaults;
  capabilities: LlmProviderCapabilities;
  extraHeaders: Record<string, string>;
  hasApiKey: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
