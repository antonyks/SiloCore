import fetch, { Response } from 'node-fetch';
import { jest } from '@jest/globals';
import { logger } from '../../config/logger';
import {
  createSessionTitleCompletionOptions,
  SESSION_TITLE_COMPLETION_FALLBACK_TIMEOUT_MS,
} from '../../modules/chat/sessionTitleCompletion.options';
import { ILlmProvider } from '../../modules/llm/llm.interface';
import { LlmProviderConfig, LlmProviderType } from '../../modules/llm/llm.types';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';
import { OpenAiCompatibleProvider } from '../../modules/llm/providers/openaiCompatible.provider';

jest.mock('node-fetch', () => jest.fn());
jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockedLogger = logger as unknown as { error: jest.Mock };
const MODEL = 'completion-cancellation-test-model';
const request = { model: MODEL, messages: [{ role: 'user' as const, content: 'test prompt' }] };

function createProvider(type: LlmProviderType, timeoutMs?: number): ILlmProvider {
  const config: LlmProviderConfig = {
    id: `test-${type}`,
    name: 'Test provider',
    type,
    enabled: true,
    baseUrl: 'http://127.0.0.1:12345',
    defaultModel: MODEL,
    timeoutMs,
  };
  return type === 'ollama' ? new OllamaProvider(config) : new OpenAiCompatibleProvider(config);
}

function resolvedResponse(type: LlmProviderType): Response {
  return {
    ok: true,
    status: 200,
    json: async () => type === 'ollama'
      ? { model: MODEL, message: { content: 'answer' } }
      : { model: MODEL, choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }] },
  } as unknown as Response;
}

function fetchedSignal(): AbortSignal | undefined {
  return mockedFetch.mock.calls.at(-1)?.[1]?.signal as AbortSignal | undefined;
}

function rejectWhenAborted(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    const fail = () => {
      const error = new Error('private upstream abort text');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal?.aborted) fail();
    else signal?.addEventListener('abort', fail, { once: true });
  });
}

describe.each(['ollama', 'openai-compatible'] as const)('%s completion cancellation', (type) => {
  beforeEach(() => {
    mockedFetch.mockReset();
    jest.clearAllMocks();
  });

  it('keeps the configured timeout ahead of the title fallback', async () => {
    const deadline = new AbortController();
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const shutdown = new AbortController();
    mockedFetch.mockResolvedValue(resolvedResponse(type));
    try {
      await createProvider(type, 12_000).complete(
        request, undefined, createSessionTitleCompletionOptions(shutdown.signal),
      );

      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(12_000);
      expect(fetchedSignal()).toBeDefined();
      shutdown.abort();
      expect(fetchedSignal()?.aborted).toBe(true);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('uses the 30-minute fallback when no provider timeout is configured', async () => {
    const deadline = new AbortController();
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const shutdown = new AbortController();
    mockedFetch.mockImplementation((_url, init) => rejectWhenAborted(init?.signal as AbortSignal));
    try {
      const completion = createProvider(type).complete(
        request, undefined, createSessionTitleCompletionOptions(shutdown.signal),
      );
      expect(timeoutSpy).toHaveBeenCalledWith(SESSION_TITLE_COMPLETION_FALLBACK_TIMEOUT_MS);
      deadline.abort(new DOMException('private deadline reason', 'TimeoutError'));
      await expect(completion).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
      expect(mockedLogger.error.mock.calls.at(-1)?.[0]).toMatchObject({
        failureCategory: 'timeout', providerFailureCode: 'TIMEOUT',
      });
      expect(JSON.stringify(mockedLogger.error.mock.calls)).not.toContain('private deadline reason');
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('aborts an in-flight title call when the worker signal aborts', async () => {
    const deadline = new AbortController();
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const shutdown = new AbortController();
    mockedFetch.mockImplementation((_url, init) => rejectWhenAborted(init?.signal as AbortSignal));
    try {
      const completion = createProvider(type).complete(
        request, undefined, createSessionTitleCompletionOptions(shutdown.signal),
      );
      shutdown.abort(new Error('private shutdown reason'));
      await expect(completion).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
      expect(fetchedSignal()?.aborted).toBe(true);
      expect(mockedLogger.error.mock.calls.at(-1)?.[0]).toMatchObject({
        failureCategory: 'cancelled', providerFailureCode: 'CANCELLED', retryable: false,
      });
      expect(JSON.stringify(mockedLogger.error.mock.calls)).not.toContain('private shutdown reason');
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it.each([
    ['deadline', 'timeout', 'TIMEOUT'],
    ['shutdown', 'cancelled', 'CANCELLED'],
  ] as const)('keeps the first %s abort classification if both signals later abort', async (first, category, code) => {
    const deadline = new AbortController();
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const shutdown = new AbortController();
    let rejectFetch: (error: Error) => void = () => {};
    mockedFetch.mockImplementation(() => new Promise<Response>((_, reject) => {
      rejectFetch = reject;
    }));
    try {
      const completion = createProvider(type).complete(
        request, undefined, createSessionTitleCompletionOptions(shutdown.signal),
      );
      const abortDeadline = () => deadline.abort(new DOMException('private deadline reason', 'TimeoutError'));
      const abortShutdown = () => shutdown.abort(new Error('private shutdown reason'));
      if (first === 'deadline') {
        abortDeadline();
        abortShutdown();
      } else {
        abortShutdown();
        abortDeadline();
      }
      const error = new Error('private upstream abort text');
      error.name = 'AbortError';
      rejectFetch(error);
      await expect(completion).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
      expect(mockedLogger.error.mock.calls.at(-1)?.[0]).toMatchObject({
        failureCategory: category, providerFailureCode: code,
      });
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('leaves ordinary completion timeout behavior unchanged without options', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    mockedFetch.mockResolvedValue(resolvedResponse(type));
    try {
      await createProvider(type).complete(request);
      expect(fetchedSignal()).toBeUndefined();
      expect(timeoutSpy).not.toHaveBeenCalled();

      await createProvider(type, 2500).complete(request);
      expect(timeoutSpy).toHaveBeenCalledWith(2500);
      expect(fetchedSignal()).toBeDefined();
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
