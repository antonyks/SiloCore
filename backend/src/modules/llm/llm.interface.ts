/**
 *
 * Unified interface for all LLM provider adapters.
 */

import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmEmbeddingRequest,
  LlmEmbeddingResponse,
  LlmStreamChunk,
  LlmProviderCapabilities,
  LlmProviderConfig,
  LlmProviderListedModel,
} from './llm.types';
import { LlmOperationContext } from './llm.operation';

/**
 * Every concrete LLM provider adapter must implement this interface.
 */
export interface ILlmProvider {
  /** Unique identifier matching the config.id field. */
  readonly id: string;

  /** Provider type discriminator (ollama | openai-compatible). */
  readonly type: string;

  /** Whether this provider is currently enabled and ready to accept requests. */
  readonly isEnabled: boolean;

  /** Capabilities exposed by this provider. */
  readonly capabilities: LlmProviderCapabilities;

  /** Underlying configuration used by the adapter. */
  readonly config: LlmProviderConfig;

  // ------------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------------

  /** Initialise or validate the connection to the upstream service. */
  initialise(context?: LlmOperationContext): Promise<void>;

  /** Gracefully shut down resources (caches, keep-alive connections, etc.). */
  destroy(): Promise<void>;

  // ------------------------------------------------------------------------
  // Completion Methods
  // ------------------------------------------------------------------------

  /**
   * Send a non-streaming completion request and return the full response.
   */
  complete(request: LlmCompletionRequest, context?: LlmOperationContext): Promise<LlmCompletionResponse>;

  /**
   * Return an async iterable that yields chunks for streaming responses.
   */
  streamComplete(
    request: LlmCompletionRequest,
    context?: LlmOperationContext,
  ): AsyncIterable<LlmStreamChunk>;

  /**
   * Generate vector embeddings for one or more text inputs.
   */
  embed(request: LlmEmbeddingRequest, context?: LlmOperationContext): Promise<LlmEmbeddingResponse>;

  // ------------------------------------------------------------------------
  // Model Management (optional but recommended)
  // ------------------------------------------------------------------------

  /**
   * List available models from the upstream service.
   * Returns an empty array if not supported.
   */
  listModels(context?: LlmOperationContext): Promise<LlmProviderListedModel[]>;

  /**
   * Pull / ensure a model exists on the remote side.
   * Implemented only by providers that require explicit model pulling (e.g., Ollama).
   */
  pullModel?(model: string, context?: LlmOperationContext): Promise<void>;
}
