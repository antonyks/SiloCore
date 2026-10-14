import { InvalidInputError } from '../../errors';
import { LlmCapabilityError } from '../../modules/llm/llm.capabilities';
import { getPublicLlmErrorCode, getPublicLlmErrorMessage, normalizeAdapterError } from '../../modules/llm/llm.safeError';
import { LlmProviderError } from '../../modules/llm/llm.types';

describe('public provider failure diagnostics', () => {
  it('maps a known code to a useful message without trusting the exception message', () => {
    const error = new LlmProviderError('Authorization: Bearer private', 'provider-1', 'RATE_LIMITED', 429);

    expect(getPublicLlmErrorMessage(error)).toBe('Provider rate limit exceeded');
    expect(getPublicLlmErrorCode(error)).toBe('RATE_LIMITED');
  });

  it('rejects unrecognized or inconsistent codes', () => {
    const unknown = new LlmProviderError('private prompt', 'provider-1', 'PRIVATE_PROMPT', 500);
    const inconsistent = new LlmProviderError('private key', 'provider-1', 'HTTP_401', 503);

    expect(getPublicLlmErrorMessage(unknown)).toBe('Provider operation failed');
    expect(getPublicLlmErrorCode(unknown)).toBeUndefined();
    expect(getPublicLlmErrorMessage(inconsistent)).toBe('Provider operation failed');
    expect(getPublicLlmErrorCode(inconsistent)).toBeUndefined();
  });

  it('keeps provider authentication distinct from application authentication', () => {
    const error = new LlmProviderError('Bearer private', 'provider-1', 'AUTHENTICATION_ERROR', 401);

    expect(getPublicLlmErrorMessage(error)).toBe('Provider authentication failed');
    expect(getPublicLlmErrorCode(error)).toBe('PROVIDER_AUTHENTICATION_ERROR');
  });

  it('normalizes untrusted adapter validation text while retaining a useful code', () => {
    const error = new InvalidInputError('Invalid request: Bearer private-token');
    const normalized = normalizeAdapterError(error, 'provider-1');

    expect(getPublicLlmErrorMessage(error)).toBe('Provider operation failed');
    expect(getPublicLlmErrorCode(error)).toBeUndefined();
    expect(getPublicLlmErrorMessage(normalized)).toBe('Provider rejected the request');
    expect(getPublicLlmErrorCode(normalized)).toBe('PROVIDER_INVALID_REQUEST');
    expect(JSON.stringify({
      message: getPublicLlmErrorMessage(normalized),
      code: getPublicLlmErrorCode(normalized),
    })).not.toContain('private-token');
  });

  it('rebuilds detailed Core capability messages from validated fields', () => {
    const error = new LlmCapabilityError('openai-compatible', 'modelPulling');
    error.message = 'Bearer private-token';

    expect(getPublicLlmErrorMessage(error)).toBe('Provider type openai-compatible does not support model pulling.');
    expect(getPublicLlmErrorCode(error)).toBe('LLM_PROVIDER_CAPABILITY_UNSUPPORTED');
  });
});
