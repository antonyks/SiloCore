import { InvalidInputError } from '../../errors';
import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';
import { LlmCapabilityError } from '../../modules/llm/llm.capabilities';
import {
  classifyProviderFailure, confirmedDeadline, isGenerationFallbackEligible, providerHttpError,
  ProviderFailureOperation, ProviderFailureStage,
} from '../../modules/llm/llm.failure';
import { LlmProviderError, LlmProviderType, LlmStreamingError } from '../../modules/llm/llm.types';

function classify(
  error: unknown,
  providerType: LlmProviderType = 'ollama',
  operation: ProviderFailureOperation = 'complete',
  stage: ProviderFailureStage = 'upstream_request',
  abortCause?: 'deadline' | 'local_cancel',
) {
  return classifyProviderFailure({
    providerType, providerId: 'provider-1', operation, stage, error,
    diagnostics: safeErrorDiagnostic(error), abortCause,
  });
}

describe('shared provider failure classification', () => {
  it('allows generation HTTP 404 to try another default provider without treating other 404s as availability failures', () => {
    for (const operation of ['complete', 'stream'] as const) {
      const failure = classify(providerHttpError({ providerType: 'ollama', providerId: 'provider-1', operation }, 404), 'ollama', operation);
      expect(failure.retryable).toBeUndefined();
      expect(isGenerationFallbackEligible(failure.error)).toBe(true);
    }
    const listingFailure = classify(providerHttpError({ providerType: 'ollama', providerId: 'provider-1', operation: 'listModels' }, 404), 'ollama', 'listModels');
    expect(isGenerationFallbackEligible(listingFailure.error)).toBe(false);
    const badRequest = classify(providerHttpError({ providerType: 'ollama', providerId: 'provider-1', operation: 'complete' }, 400), 'ollama', 'complete');
    expect(isGenerationFallbackEligible(badRequest.error)).toBe(false);
  });

  it.each([
    ['openai-compatible', 'complete', 401, 'AUTHENTICATION_ERROR', 'PROVIDER_AUTHENTICATION_ERROR', 'authentication', false],
    ['openai-compatible', 'embed', 403, 'AUTHENTICATION_ERROR', 'PROVIDER_AUTHENTICATION_ERROR', 'authentication', false],
    ['openai-compatible', 'complete', 429, 'RATE_LIMITED', 'RATE_LIMITED', 'rate_limit', true],
    ['openai-compatible', 'listModels', 404, 'MODEL_LISTING_UNSUPPORTED', 'MODEL_LISTING_UNSUPPORTED', 'capability', false],
    ['openai-compatible', 'initialise', 405, 'MODEL_LISTING_UNSUPPORTED', 'MODEL_LISTING_UNSUPPORTED', 'capability', false],
    ['openai-compatible', 'stream', 401, 'HTTP_401', 'HTTP_401', 'authentication', false],
    ['openai-compatible', 'stream', 502, 'HTTP_502', 'HTTP_502', 'http', true],
    ['ollama', 'initialise', 503, 'HEALTH_CHECK_FAILED', 'HEALTH_CHECK_FAILED', 'http', true],
    ['ollama', 'complete', 401, 'HTTP_401', 'HTTP_401', 'authentication', false],
    ['ollama', 'pullModel', 500, 'HTTP_500', 'HTTP_500', 'http', true],
  ] as const)('%s %s HTTP %i retains its public code', (providerType, operation, status, code, publicCode, category, retryable) => {
    const error = providerHttpError({ providerType, providerId: 'provider-1', operation }, status);
    const failure = classify(error, providerType, operation);
    expect(failure.error).toBe(error);
    expect(failure.error).toMatchObject({ code, statusCode: status });
    expect(failure.publicCode).toBe(publicCode);
    expect(failure.failureCategory).toBe(category);
    expect(failure.retryable).toBe(retryable);
    expect(failure.diagnostics.upstreamStatus).toBe(status);
    if (operation === 'stream') expect(error).toBeInstanceOf(LlmStreamingError);
  });

  it('keeps an ambiguous AbortError public timeout mapping without claiming a confirmed timeout', () => {
    const error = new Error('private abort reason');
    error.name = 'AbortError';
    const ambiguous = classify(error);
    expect(ambiguous.error).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(ambiguous.failureCategory).toBe('unknown');
    expect(ambiguous.retryable).toBeUndefined();

    const deadline = classify(error, 'ollama', 'complete', 'upstream_request', 'deadline');
    expect(deadline.failureCategory).toBe('timeout');
    expect(deadline.retryable).toBe(true);
    const cancelled = classify(error, 'ollama', 'complete', 'local_abort', 'local_cancel');
    expect(cancelled.failureCategory).toBe('cancelled');
    expect(cancelled.retryable).toBe(false);
  });

  it.each([
    ['deadline', 'timeout', 'TIMEOUT', true],
    ['local_cancel', 'cancelled', 'CANCELLED', false],
  ] as const)('recognizes a cross-realm style AbortError with a confirmed %s', (cause, category, code, retryable) => {
    const error = { name: 'AbortError', message: 'private abort reason' };
    expect(error).not.toBeInstanceOf(Error);
    const failure = classify(error, 'ollama', 'complete', 'upstream_request', cause);
    expect(failure.error).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(failure.failureCategory).toBe(category);
    expect(failure.providerFailureCode).toBe(code);
    expect(failure.retryable).toBe(retryable);
  });

  it('recognizes a cross-realm style TimeoutError only with a confirmed deadline', () => {
    const error = { name: 'TimeoutError', message: 'private timeout reason' };
    expect(classify(error, 'ollama', 'complete', 'upstream_request', 'deadline'))
      .toMatchObject({ failureCategory: 'timeout', providerFailureCode: 'TIMEOUT',
        error: { code: 'REQUEST_TIMEOUT' } });
    expect(classify(error).failureCategory).toBe('unknown');
  });

  it.each(['deadline', 'local_cancel'] as const)(
    'does not relabel an HTTP error when %s also fires', (cause) => {
      const error = providerHttpError({ providerType: 'openai-compatible', providerId: 'provider-1', operation: 'complete' }, 401);
      const failure = classify(error, 'openai-compatible', 'complete', 'upstream_request', cause);
      expect(failure.error).toBe(error);
      expect(failure.failureCategory).toBe('authentication');
      expect(failure.providerFailureCode).toBe('AUTHENTICATION');
      expect(failure.retryable).toBe(false);
    },
  );

  it('does not relabel a malformed response when the deadline also fires', () => {
    const error = new LlmProviderError('private content', 'provider-1', 'MALFORMED_RESPONSE');
    const failure = classify(error, 'openai-compatible', 'complete', 'response_parse', 'deadline');
    expect(failure.error).toBe(error);
    expect(failure.failureCategory).toBe('malformed_response');
    expect(failure.providerFailureCode).toBe('MALFORMED_RESPONSE');
    expect(failure.retryable).toBe(false);
  });

  it('recognizes only an owned, triggered timeout signal as a confirmed deadline', () => {
    expect(confirmedDeadline(undefined)).toBeUndefined();
    const controller = new AbortController();
    expect(confirmedDeadline(controller.signal)).toBeUndefined();
    controller.abort(new DOMException('deadline', 'TimeoutError'));
    expect(confirmedDeadline(controller.signal)).toBe('deadline');
  });

  it('distinguishes malformed Ollama JSON internally without changing its generic public code', () => {
    const failure = classify(new SyntaxError('private upstream JSON body'), 'ollama', 'complete', 'response_parse');
    expect(failure.error).toMatchObject({ code: 'UPSTREAM_ERROR', message: 'Ollama completion failed' });
    expect(failure.publicCode).toBe('UPSTREAM_ERROR');
    expect(failure.stage).toBe('response_parse');
    expect(failure.providerFailureCode).toBe('MALFORMED_RESPONSE');
    expect(failure.failureCategory).toBe('malformed_response');
    expect(failure.retryable).toBe(false);
    expect(JSON.stringify({
      publicMessage: failure.publicMessage, diagnostics: failure.diagnostics,
      stage: failure.stage, providerFailureCode: failure.providerFailureCode,
    })).not.toContain('private upstream JSON body');
  });

  it.each([
    ['MALFORMED_RESPONSE', 'complete', 'response_parse'],
    ['MALFORMED_EMBEDDING_RESPONSE', 'embed', 'response_parse'],
    ['MALFORMED_MODEL_LIST', 'listModels', 'response_parse'],
    ['MALFORMED_STREAM_CHUNK', 'stream', 'stream_read'],
  ] as const)('classifies %s without losing the safe public code', (code, operation, stage) => {
    const error = new LlmProviderError('private content', 'provider-1', code);
    const failure = classify(error, 'openai-compatible', operation);
    expect(failure.publicCode).toBe(code);
    expect(failure.stage).toBe(stage);
    expect(failure.failureCategory).toBe('malformed_response');
    expect(failure.retryable).toBe(false);
  });

  it('keeps allowlisted network details and never copies exception text', () => {
    const error = Object.assign(new Error('Bearer private-token\nprivate prompt'), { code: 'ECONNRESET' });
    const failure = classify(error, 'openai-compatible', 'embed');
    expect(failure.error).toMatchObject({ code: 'EMBEDDINGS_FAILED' });
    expect(failure.failureCategory).toBe('connection');
    expect(failure.retryable).toBe(true);
    expect(failure.diagnostics).toEqual(expect.objectContaining({
      failureCode: 'ECONNRESET', failureReason: 'Connection reset', failureSite: expect.any(String),
    }));
    expect(JSON.stringify({ publicMessage: failure.publicMessage, diagnostics: failure.diagnostics })).not.toContain('private-token');
  });

  it('keeps validation and Core capability categories distinct', () => {
    const invalid = classify(new InvalidInputError('Bearer private-token'));
    expect(invalid.failureCategory).toBe('invalid_request');
    expect(invalid.retryable).toBe(false);
    expect(invalid.publicCode).toBe('UPSTREAM_ERROR');
    const capability = classify(new LlmCapabilityError('ollama', 'modelPulling'));
    expect(capability.failureCategory).toBe('capability');
    expect(capability.retryable).toBe(false);
    expect(capability.publicCode).toBe('LLM_PROVIDER_CAPABILITY_UNSUPPORTED');
  });
});
