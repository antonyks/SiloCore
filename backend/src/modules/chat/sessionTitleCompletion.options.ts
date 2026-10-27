import { LlmCompletionOptions } from '../llm/llm.types';

export const SESSION_TITLE_COMPLETION_FALLBACK_TIMEOUT_MS = 30 * 60 * 1000;

/** The worker's shutdown signal stops an in-flight title call. */
export function createSessionTitleCompletionOptions(shutdownSignal: AbortSignal): LlmCompletionOptions {
  return {
    signal: shutdownSignal,
    fallbackTimeoutMs: SESSION_TITLE_COMPLETION_FALLBACK_TIMEOUT_MS,
  };
}
