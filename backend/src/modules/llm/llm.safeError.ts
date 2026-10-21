import { InvalidInputError } from '../../errors';
import { LlmProviderError } from './llm.types';
import { getPublicCapabilityErrorMessage, LlmCapabilityError, LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE } from './llm.capabilities';

const PUBLIC_PROVIDER_ERRORS: Record<string, string> = {
  AUTHENTICATION_ERROR: 'Provider authentication failed',
  RATE_LIMITED: 'Provider rate limit exceeded',
  MODEL_LISTING_UNSUPPORTED: 'Provider model listing is unsupported',
  REQUEST_TIMEOUT: 'Provider request timed out',
  CONNECTION_ERROR: 'Provider connection failed',
  UPSTREAM_ERROR: 'Provider request failed',
  UPSTREAM_STREAM_ERROR: 'Provider stream failed',
  LIST_MODELS_FAILED: 'Provider model listing failed',
  PULL_MODEL_FAILED: 'Provider model pull failed',
  EMBEDDINGS_FAILED: 'Provider embedding failed',
  MALFORMED_RESPONSE: 'Provider response was malformed',
  MALFORMED_STREAM_CHUNK: 'Provider stream chunk was malformed',
  MALFORMED_MODEL_LIST: 'Provider model list was malformed',
  MALFORMED_EMBEDDING_RESPONSE: 'Provider embedding response was malformed',
  PROVIDER_INVALID_REQUEST: 'Provider rejected the request',
};

/** Validate codes copied from a public provider result into operational logs. */
export function isPublicLlmErrorCode(code: unknown): code is string {
  if (typeof code !== 'string') return false;
  if (Object.prototype.hasOwnProperty.call(PUBLIC_PROVIDER_ERRORS, code)) return true;
  if (code === 'PROVIDER_AUTHENTICATION_ERROR' || code === 'HEALTH_CHECK_FAILED'
    || code === LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE || code === 'ADAPTER_UNAVAILABLE') return true;
  const httpStatus = /^HTTP_([1-5]\d\d)$/.exec(code);
  return httpStatus !== null && Number(httpStatus[1]) <= 599;
}

function safeHttpStatus(error: LlmProviderError): number | undefined {
  try {
    const status = error.statusCode;
    return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
      ? status
      : undefined;
  } catch {
    return undefined;
  }
}

function safeProviderCode(error: LlmProviderError): string | undefined {
  try {
    const code = error.code;
    if (typeof code !== 'string') return undefined;
    if (Object.prototype.hasOwnProperty.call(PUBLIC_PROVIDER_ERRORS, code)) return code;
    if (code === 'HEALTH_CHECK_FAILED') return code;
    const status = safeHttpStatus(error);
    return status !== undefined && code === `HTTP_${status}` ? code : undefined;
  } catch {
    return undefined;
  }
}

export function getPublicLlmErrorMessage(error: unknown, fallback = 'Provider operation failed'): string {
  if (error instanceof LlmCapabilityError) return getPublicCapabilityErrorMessage(error);
  if (error instanceof LlmProviderError) {
    const code = safeProviderCode(error);
    if (code?.startsWith('HTTP_')) return `Provider returned HTTP ${safeHttpStatus(error)}`;
    if (code === 'HEALTH_CHECK_FAILED') {
      const status = safeHttpStatus(error);
      return status === undefined ? 'Provider health check failed' : `Provider health check failed (HTTP ${status})`;
    }
    if (code) return PUBLIC_PROVIDER_ERRORS[code];
    return fallback;
  }

  return fallback;
}

export function getPublicLlmErrorCode(error: unknown): string | undefined {
  if (error instanceof LlmCapabilityError) return LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE;
  if (error instanceof LlmProviderError) {
    const code = safeProviderCode(error);
    return code === 'AUTHENTICATION_ERROR' ? 'PROVIDER_AUTHENTICATION_ERROR' : code;
  }

  return undefined;
}

/** Adapter-thrown input errors are untrusted; only Core capability checks retain 400-level detail. */
export function normalizeAdapterError(error: unknown, providerId: string): unknown {
  if (error instanceof InvalidInputError && !(error instanceof LlmCapabilityError)) {
    return new LlmProviderError('Provider rejected the request', providerId, 'PROVIDER_INVALID_REQUEST');
  }
  return error;
}
