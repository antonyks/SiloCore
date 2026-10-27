import { InvalidInputError } from '../../errors';
import { LlmCapabilityError } from './llm.capabilities';
import {
  LlmAuthenticationError, LlmProviderError, LlmProviderType,
  LlmRateLimitError, LlmStreamingError,
} from './llm.types';
import { getPublicLlmErrorCode, getPublicLlmErrorMessage } from './llm.safeError';

export type ProviderFailureOperation = 'initialise' | 'listModels' | 'complete' | 'stream' | 'embed' | 'pullModel';
export const PROVIDER_FAILURE_STAGES = ['upstream_request', 'response_parse', 'stream_read', 'local_abort'] as const;
export type ProviderFailureStage = (typeof PROVIDER_FAILURE_STAGES)[number];
export const PROVIDER_FAILURE_CATEGORIES = [
  'authentication', 'rate_limit', 'timeout', 'connection', 'http', 'malformed_response',
  'stream', 'cancelled', 'capability', 'invalid_request', 'unknown',
] as const;
export type ProviderFailureCategory = (typeof PROVIDER_FAILURE_CATEGORIES)[number];
export const PROVIDER_FAILURE_CODES = [
  'AUTHENTICATION', 'RATE_LIMIT', 'TIMEOUT', 'CONNECTION', 'HTTP_ERROR',
  'MALFORMED_RESPONSE', 'STREAM_ERROR', 'CANCELLED', 'CAPABILITY', 'INVALID_REQUEST', 'UNKNOWN',
] as const;
export type ProviderFailureCode = (typeof PROVIDER_FAILURE_CODES)[number];

type Context = {
  providerType: LlmProviderType;
  providerId: string;
  operation: ProviderFailureOperation;
};

type FailureInput = Context & {
  error: unknown;
  stage: ProviderFailureStage;
  diagnostics: Record<string, string | number>;
  /** Only pass when this adapter's own signal confirms the cause. */
  abortCause?: 'deadline' | 'local_cancel';
};

export type ProviderFailure = {
  error: Error;
  publicCode?: string;
  publicMessage: string;
  stage: ProviderFailureStage;
  failureCategory: ProviderFailureCategory;
  providerFailureCode: ProviderFailureCode;
  retryable?: boolean;
  diagnostics: Record<string, string | number>;
};

const TRANSIENT_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH',
]);
const availabilityFailures = new WeakMap<Error, ProviderFailureCode>();
const generationNotFoundFailures = new WeakSet<Error>();

export function availabilityFailureCode(error: unknown): ProviderFailureCode | null {
  return error instanceof Error ? availabilityFailures.get(error) ?? null : null;
}

/** A missing configured model can be retried on another provider in default mode. */
export function isGenerationFallbackEligible(error: unknown): boolean {
  return availabilityFailureCode(error) !== null
    || (error instanceof Error && generationNotFoundFailures.has(error));
}
const MALFORMED_CODES = new Set([
  'MALFORMED_RESPONSE', 'MALFORMED_STREAM_CHUNK', 'MALFORMED_MODEL_LIST', 'MALFORMED_EMBEDDING_RESPONSE',
]);

export function confirmedDeadline(signal: AbortSignal | undefined): 'deadline' | undefined {
  if (!signal?.aborted) return undefined;
  try {
    const reason: unknown = signal.reason;
    return reason !== null && typeof reason === 'object' && 'name' in reason
      && reason.name === 'TimeoutError' ? 'deadline' : undefined;
  } catch {
    return undefined;
  }
}

function label(type: LlmProviderType): string {
  return type === 'ollama' ? 'Ollama' : 'OpenAI-compatible';
}

/** Build only adapter-owned HTTP errors. Never read the response body or headers. */
export function providerHttpError(context: Context, status: number): LlmProviderError {
  const { providerType, providerId, operation } = context;
  const name = label(providerType);
  if (providerType === 'openai-compatible' && operation !== 'stream') {
    if (status === 401 || status === 403) {
      return new LlmAuthenticationError(`${name} authentication failed`, providerId, 'AUTHENTICATION_ERROR', status);
    }
    if (status === 429) {
      return new LlmRateLimitError(`${name} rate limit exceeded`, providerId, 'RATE_LIMITED', status);
    }
    if ((operation === 'listModels' || operation === 'initialise') && (status === 404 || status === 405)) {
      return new LlmProviderError(`${name} model listing is unsupported`, providerId, 'MODEL_LISTING_UNSUPPORTED', status);
    }
  }
  if (providerType === 'ollama' && operation === 'initialise') {
    return new LlmProviderError('Ollama health check failed with status ' + status, providerId, 'HEALTH_CHECK_FAILED', status);
  }
  const prefix = providerType === 'ollama'
    ? ({ listModels: 'Ollama model listing failed', complete: 'Ollama completion failed',
      stream: 'Ollama streaming failed', embed: 'Ollama embedding failed',
      pullModel: 'Failed to pull Ollama model', initialise: 'Ollama health check failed' } as const)[operation]
    : ({ listModels: 'OpenAI-compatible model listing failed', complete: 'OpenAI-compatible completion failed',
      stream: 'OpenAI-compatible streaming failed', embed: 'OpenAI-compatible embedding failed',
      pullModel: 'OpenAI-compatible model pull failed', initialise: 'OpenAI-compatible model listing failed' } as const)[operation];
  const message = `${prefix} with status ${status}`;
  return operation === 'stream'
    ? new LlmStreamingError(message, providerId, `HTTP_${status}`, status)
    : new LlmProviderError(message, providerId, `HTTP_${status}`, status);
}

function genericError(context: Context, aborted: boolean): LlmProviderError {
  const { providerType, providerId, operation } = context;
  const name = label(providerType);
  const messages = providerType === 'ollama'
    ? {
      initialise: aborted ? 'Ollama health check timed out' : 'Ollama unreachable',
      listModels: 'Failed to list Ollama models', complete: 'Ollama completion failed',
      stream: aborted ? 'Ollama stream timed out or was aborted' : 'Ollama stream failed',
      embed: aborted ? 'Ollama embedding timed out or was aborted' : 'Ollama embedding failed',
      pullModel: 'Failed to pull Ollama model',
    }
    : {
      initialise: aborted ? `${name} model listing timed out or was aborted` : `${name} model listing failed`,
      listModels: aborted ? `${name} model listing timed out or was aborted` : `${name} model listing failed`,
      complete: aborted ? `${name} completion timed out or was aborted` : `${name} completion failed`,
      stream: aborted ? `${name} stream timed out or was aborted` : `${name} stream failed`,
      embed: aborted ? `${name} embedding timed out or was aborted` : `${name} embedding failed`,
      pullModel: `${name} model pull failed`,
    };
  const code = aborted ? 'REQUEST_TIMEOUT'
    : operation === 'initialise' ? (providerType === 'ollama' ? 'CONNECTION_ERROR' : 'LIST_MODELS_FAILED')
      : operation === 'listModels' ? 'LIST_MODELS_FAILED'
        : operation === 'pullModel' ? 'PULL_MODEL_FAILED'
          : operation === 'embed' ? 'EMBEDDINGS_FAILED'
            : operation === 'stream' ? 'UPSTREAM_STREAM_ERROR' : 'UPSTREAM_ERROR';
  return operation === 'stream'
    ? new LlmStreamingError(messages[operation], providerId, code)
    : new LlmProviderError(messages[operation], providerId, code);
}

export function classifyProviderFailure(input: FailureInput): ProviderFailure {
  const { error, diagnostics } = input;
  // Fetch errors can cross a JavaScript realm boundary, where instanceof Error is false.
  const aborted = error !== null && typeof error === 'object'
    && 'name' in error && error.name === 'AbortError';
  const abortCause = aborted ? input.abortCause : undefined;
  let normalized: Error;
  if (error instanceof LlmCapabilityError) {
    normalized = error;
  } else if (error instanceof LlmProviderError) {
    normalized = input.operation === 'stream' && !(error instanceof LlmStreamingError)
      ? new LlmStreamingError(error.message, input.providerId, error.code, error.statusCode)
      : error;
  } else {
    normalized = genericError(input, aborted);
  }

  const rawStatus = normalized instanceof LlmProviderError ? normalized.statusCode : undefined;
  const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus)
    && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined;
  const code = normalized instanceof LlmProviderError ? normalized.code : undefined;
  const malformed = MALFORMED_CODES.has(code ?? '')
    || (input.stage === 'response_parse' && (error instanceof SyntaxError || error instanceof TypeError));
  const stage: ProviderFailureStage = malformed
    ? (input.operation === 'stream' ? 'stream_read' : 'response_parse') : input.stage;
  let failureCategory: ProviderFailureCategory = 'unknown';
  let providerFailureCode: ProviderFailureCode = 'UNKNOWN';
  let retryable: boolean | undefined;

  if (abortCause === 'local_cancel') {
    failureCategory = 'cancelled'; providerFailureCode = 'CANCELLED'; retryable = false;
  } else if (abortCause === 'deadline') {
    failureCategory = 'timeout'; providerFailureCode = 'TIMEOUT'; retryable = true;
  } else if (malformed) {
    failureCategory = 'malformed_response'; providerFailureCode = 'MALFORMED_RESPONSE'; retryable = false;
  } else if (error instanceof LlmCapabilityError || code === 'MODEL_LISTING_UNSUPPORTED') {
    failureCategory = 'capability'; providerFailureCode = 'CAPABILITY'; retryable = false;
  } else if (error instanceof InvalidInputError || code === 'PROVIDER_INVALID_REQUEST') {
    failureCategory = 'invalid_request'; providerFailureCode = 'INVALID_REQUEST'; retryable = false;
  } else if (code === 'AUTHENTICATION_ERROR' || status === 401 || status === 403) {
    failureCategory = 'authentication'; providerFailureCode = 'AUTHENTICATION'; retryable = false;
  } else if (code === 'RATE_LIMITED' || status === 429) {
    failureCategory = 'rate_limit'; providerFailureCode = 'RATE_LIMIT'; retryable = true;
  } else if (typeof status === 'number' && status >= 100 && status <= 599) {
    failureCategory = 'http'; providerFailureCode = 'HTTP_ERROR';
    if (status >= 500) retryable = true;
  } else if (typeof diagnostics.failureCode === 'string' && TRANSIENT_CODES.has(diagnostics.failureCode)) {
    failureCategory = 'connection'; providerFailureCode = 'CONNECTION'; retryable = true;
  } else if (code === 'CONNECTION_ERROR') {
    failureCategory = 'connection'; providerFailureCode = 'CONNECTION'; retryable = true;
  } else if (stage === 'upstream_request' && !aborted &&
    (error instanceof TypeError || (error instanceof Error && error.name === 'FetchError'))) {
    failureCategory = 'connection'; providerFailureCode = 'CONNECTION'; retryable = true;
  } else if (stage === 'stream_read' && !aborted) {
    failureCategory = 'stream'; providerFailureCode = 'STREAM_ERROR';
  }

  if (retryable === true) availabilityFailures.set(normalized, providerFailureCode);
  else availabilityFailures.delete(normalized);
  if (status === 404 && code === 'HTTP_404'
    && (input.operation === 'complete' || input.operation === 'stream')) {
    generationNotFoundFailures.add(normalized);
  } else {
    generationNotFoundFailures.delete(normalized);
  }

  return {
    error: normalized,
    publicCode: getPublicLlmErrorCode(normalized),
    publicMessage: getPublicLlmErrorMessage(normalized),
    stage,
    failureCategory,
    providerFailureCode,
    retryable,
    diagnostics: {
      ...diagnostics,
      ...(status !== undefined ? { upstreamStatus: status } : {}),
    },
  };
}
