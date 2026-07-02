/**
 *
 * Type definitions for the LLM provider abstraction layer.
 */

import { MessageAuthor } from '../chat/chat.model';

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

export type LlmMessageRole = 'user' | 'assistant' | 'system';

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

/** Internal representation of a conversation message. */
export interface ChatMessageInternal {
  id?: number;
  content: string;
  author: MessageAuthor;        // 'USER' | 'ASSISTANT' | 'SYSTEM'
  sessionId: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

// ---------------------------------------------------------------------------
// Request / Response Types
// ---------------------------------------------------------------------------

/** Parameters for a single LLM completion request. */
export interface LlmCompletionRequest {
  /** The model identifier (e.g., "llama2", "gpt-4", "mistral"). */
  model: string;

  /** Conversation history including the latest user message. */
  messages: LlmMessage[];

  /** Maximum tokens to generate. */
  maxTokens?: number;

  /** Temperature for sampling (0.0 – 1.0). */
  temperature?: number;

  /** Top-p nucleus sampling parameter. */
  topP?: number;

  /** Stop sequences that halt generation. */
  stopSequences?: string[];

  /** Whether to stream the response. */
  stream?: boolean;
}

/** Token usage breakdown returned by the provider. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** A single chunk received during streaming. */
export interface LlmStreamChunk {
  /** Partial text content of this chunk. */
  content: string;

  /** Whether this is the final chunk. */
  done?: boolean;

  /** Token usage (only present in the final chunk, if available). */
  usage?: TokenUsage;
}

/** Complete non-streaming response from an LLM provider. */
export interface LlmCompletionResponse {
  /** The full generated text. */
  content: string;

  /** Model that generated the response. */
  model: string;

  /** Token usage statistics. */
  usage?: TokenUsage;

  /** Latency in milliseconds (measured by the adapter). */
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/** Base configuration shared across all providers. */
export interface LlmProviderConfig {
  /** Unique identifier for this provider instance. */
  id: string;

  /** Human-readable name (e.g., "Local Ollama", "OpenAI"). */
  name: string;

  /** Provider type discriminator. */
  type: LlmProviderType;

  /** Whether this provider is enabled. */
  enabled: boolean;

  /** Endpoint URL for the provider API. */
  baseUrl: string;

  /** API key or authentication token (if required). */
  apiKey?: string;

  /** Default model to use when none is specified. */
  defaultModel: string;

  /** Request timeout in milliseconds. */
  timeoutMs?: number;

  /** Optional headers to include with every request. */
  extraHeaders?: Record<string, string>;
}

/** Runtime source of truth for provider type values exposed by the API/adapters. */
export const SUPPORTED_LLM_PROVIDER_TYPES = ['ollama', 'openai-compatible'] as const;

/** Discriminated union of supported provider types. */
export type LlmProviderType = (typeof SUPPORTED_LLM_PROVIDER_TYPES)[number];

/** DB enum values used by Prisma for persisted provider configs. */
export type LlmProviderConfigTypeValue = 'OLLAMA' | 'OPENAI_COMPATIBLE';

// ---------------------------------------------------------------------------
// Provider Capability Flags
// ---------------------------------------------------------------------------

export interface LlmProviderCapabilities {
  supportsStreaming: boolean;
  supportsSystemMessages: boolean;
  supportsToolCalls: boolean;   // Reserved for future expansion
  supportsVision: boolean;      // Reserved for future expansion
}

// ---------------------------------------------------------------------------
// Model Listing Types
// ---------------------------------------------------------------------------

export interface LlmListedModel {
  providerId: string;
  providerName: string;
  providerType: LlmProviderType;
  modelId: string;
  modelName: string;
}

export type LlmProviderModelListStatus = 'success' | 'error' | 'skipped';

export interface LlmProviderModelListResult {
  providerId: string;
  providerName: string;
  providerType: LlmProviderType;
  status: LlmProviderModelListStatus;
  modelCount: number;
  errorMessage?: string;
}

export interface LlmModelListResult {
  models: LlmListedModel[];
  providers: LlmProviderModelListResult[];
}

export interface LlmProviderOperationResult {
  providerId: string;
  providerName: string;
  providerType: LlmProviderType;
  status: LlmProviderModelListStatus;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

export class LlmStreamingError extends LlmProviderError {}
export class LlmAuthenticationError extends LlmProviderError {}
export class LlmRateLimitError extends LlmProviderError {}
