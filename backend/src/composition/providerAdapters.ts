import { ILlmProvider } from '../modules/llm/llm.interface';
import { LlmProviderConfig, LlmProviderType } from '../modules/llm/llm.types';
import { OllamaProvider } from '../modules/llm/providers/ollama.provider';
import { OpenAiCompatibleProvider } from '../modules/llm/providers/openaiCompatible.provider';

export type ProviderAdapterFactories = Readonly<Partial<Record<
  LlmProviderType,
  (config: LlmProviderConfig) => ILlmProvider
>>>;

export const coreProviderFactories: ProviderAdapterFactories = Object.freeze({
  ollama: (config: LlmProviderConfig) => new OllamaProvider(config),
  'openai-compatible': (config: LlmProviderConfig) => new OpenAiCompatibleProvider(config),
});
