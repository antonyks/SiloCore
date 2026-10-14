import { logger } from '../../config/logger';
import { logLlmEvent } from '../../modules/llm/llm.logging';
import { providerModelMismatch } from '../../modules/llm/llm.modelIdentity';

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

describe('provider model identity and safe LLM log fields', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    [undefined, undefined],
    [null, undefined],
    [123, undefined],
    ['', undefined],
    ['  ', undefined],
    ['a'.repeat(1025), undefined],
    ['selected-model', undefined],
    ['different-upstream-model', true],
  ])('classifies reported model %p', (reported, expected) => {
    expect(providerModelMismatch('selected-model', reported)).toBe(expected);
  });

  it('drops extra runtime properties while retaining useful safe diagnostics', () => {
    logLlmEvent({
      requestId: 'request-1',
      providerId: 'provider-1',
      providerType: 'ollama',
      model: 'selected-model',
      operation: 'provider.embed',
      status: 'error',
      latencyMs: 12,
      errorCode: 'UNKNOWN_ERROR',
      failureKind: 'TypeError',
      failureCode: 'ECONNRESET',
      failureReason: 'Connection reset',
      upstreamStatus: 502,
      failureSite: 'src/modules/llm/providers/ollama.provider.ts:12',
      upstreamBody: 'private upstream body',
      headers: { Authorization: 'private token' },
      providerModelMismatch: 'private string',
    } as never);

    expect(logger.error).toHaveBeenCalledWith({
      requestId: 'request-1',
      providerId: 'provider-1',
      providerType: 'ollama',
      model: 'selected-model',
      operation: 'provider.embed',
      status: 'error',
      latencyMs: 12,
      errorCode: 'UNKNOWN_ERROR',
      failureKind: 'TypeError',
      failureCode: 'ECONNRESET',
      failureReason: 'Connection reset',
      upstreamStatus: 502,
      failureSite: 'src/modules/llm/providers/ollama.provider.ts:12',
    }, 'provider.embed.error');
  });
});
