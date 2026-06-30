/**
 *
 * Abstract base class shared by all LLM provider adapters.
 */

import { ILlmProvider } from './llm.interface';
import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmStreamChunk,
  LlmProviderCapabilities,
  LlmProviderConfig,
  LlmProviderError,
} from './llm.types';

/** Default capabilities assumed if a child class doesn't override them. */
const DEFAULT_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsSystemMessages: true,
  supportsToolCalls: false,
  supportsVision: false,
};

export abstract class AbstractLlmProvider implements ILlmProvider {
  readonly id: string;
  readonly type: string;
  readonly isEnabled: boolean;
  readonly config: LlmProviderConfig;
  readonly capabilities: LlmProviderCapabilities;

  constructor(config: LlmProviderConfig, capabilities?: Partial<LlmProviderCapabilities>) {
    this.id = config.id;
    this.type = config.type;
    this.isEnabled = config.enabled;
    this.config = config;
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };
  }

  // ------------------------------------------------------------------------
  // Lifecycle (default no-op implementations)
  // ------------------------------------------------------------------------

  async initialise(): Promise<void> {
    // Sub-class may override to perform health-check or pre-warming.
  }

  async destroy(): Promise<void> {
    // Sub-class may override to close pools, cancel pending requests, etc.
  }

  // ------------------------------------------------------------------------
  // Core methods – MUST be implemented by subclasses
  // ------------------------------------------------------------------------

  abstract complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  abstract streamComplete(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk>;
  abstract listModels(): Promise<string[]>;

  // ------------------------------------------------------------------------
  // Shared Helpers
  // ------------------------------------------------------------------------

  /** Build an `Authorization` header value when an API key is configured. */
  protected buildAuthHeader(): string | undefined {
    if (!this.config.apiKey) return undefined;
    return `Bearer ${this.config.apiKey}`;
  }

  /** Build request headers shared by provider HTTP calls. */
  protected buildRequestHeaders(defaultHeaders: Record<string, string> = {}): Record<string, string> {
    const authHeader = this.buildAuthHeader();

    return {
      ...defaultHeaders,
      ...(this.config.extraHeaders ?? {}),
      ...(authHeader ? { Authorization: authHeader } : {}),
    };
  }

  /** Build an abort signal when a request timeout is configured. */
  protected buildAbortSignal(timeoutMs: number | undefined = this.config.timeoutMs): AbortSignal | undefined {
    if (!timeoutMs) return undefined;
    return AbortSignal.timeout(timeoutMs);
  }

  /** Throw a typed error with provider context attached. */
  protected throwProviderError(
    message: string,
    code?: string,
    statusCode?: number,
  ): never {
    throw new LlmProviderError(message, this.id, code, statusCode);
  }

  /** Measure latency of an async operation in milliseconds. */
  protected async withLatency<T>(fn: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
    const start = Date.now();
    const value = await fn();
    return { value, latencyMs: Date.now() - start };
  }

  /** Clone and merge request defaults before forwarding to the upstream API. */
  protected enrichRequest(request: LlmCompletionRequest): LlmCompletionRequest {
    return {
      temperature: 0.7,
      topP: 1,
      maxTokens: 2048,
      stream: false,
      ...request,
    };
  }
}
