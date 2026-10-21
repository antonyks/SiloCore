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

  it('drops untrusted failure taxonomy values at runtime', () => {
    logLlmEvent({
      operation: 'provider.embed', status: 'error',
      stage: 'private prompt', failureCategory: 'private category',
      providerFailureCode: 'private code',
    } as never);
    expect(logger.error).toHaveBeenCalledWith({
      operation: 'provider.embed', status: 'error',
    }, 'provider.embed.error');
  });

  it('allows only known health-sample diagnostic fields', () => {
    logLlmEvent({
      operation: 'providerHealthSample.record', status: 'error',
      sampleOperation: 'MODEL_REGISTRY', sampleStatus: 'ERROR',
      sampleErrorCode: 'HTTP_503',
    });
    expect(logger.error).toHaveBeenLastCalledWith(expect.objectContaining({
      sampleOperation: 'MODEL_REGISTRY', sampleStatus: 'ERROR', sampleErrorCode: 'HTTP_503',
    }), 'providerHealthSample.record.error');

    logLlmEvent({
      operation: 'providerHealthSample.record', status: 'error',
      sampleOperation: 'Bearer private operation', sampleStatus: 'private status',
      sampleErrorCode: 'Bearer private code',
    } as never);
    expect(logger.error).toHaveBeenLastCalledWith({
      operation: 'providerHealthSample.record', status: 'error',
    }, 'providerHealthSample.record.error');
  });
});
