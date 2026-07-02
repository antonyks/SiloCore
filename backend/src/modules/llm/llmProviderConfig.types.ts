import {
  LlmProviderConfigTypeValue,
  LlmProviderType,
} from './llm.types';

export interface LlmProviderConfigCreateInput {
  name: string;
  type: LlmProviderType;
  baseUrl: string;
  enabled?: boolean;
  defaultModel: string;
  timeoutMs?: number | null;
  extraHeaders?: Record<string, string>;
  apiKey?: string | null;
}

export interface LlmProviderConfigUpdateInput {
  name?: string;
  type?: LlmProviderType;
  baseUrl?: string;
  enabled?: boolean;
  defaultModel?: string;
  timeoutMs?: number | null;
  extraHeaders?: Record<string, string>;
  apiKey?: string | null;
}

export function toDbProviderType(type: LlmProviderType): LlmProviderConfigTypeValue {
  switch (type) {
    case 'ollama':
      return 'OLLAMA';
    case 'openai-compatible':
      return 'OPENAI_COMPATIBLE';
    default:
      throw new Error(`Unsupported LLM provider type: ${String(type)}`);
  }
}

export function fromDbProviderType(type: LlmProviderConfigTypeValue | string): LlmProviderType {
  if (type === 'OLLAMA') {
    return 'ollama';
  }

  if (type === 'OPENAI_COMPATIBLE') {
    return 'openai-compatible';
  }

  throw new Error(`Unsupported persisted LLM provider type: ${String(type)}`);
}
