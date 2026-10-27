import fetch, { Response } from 'node-fetch';
import { jest } from '@jest/globals';
import { logger } from '../../config/logger';
import { OpenAiCompatibleProvider } from '../../modules/llm/providers/openaiCompatible.provider';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';
import { createLlmOperationContext } from '../../modules/llm/llm.operation';
import {
  LlmAuthenticationError,
  LlmProviderConfig,
  LlmRateLimitError,
} from '../../modules/llm/llm.types';

jest.mock('node-fetch', () => jest.fn());
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockedLogger = logger as unknown as {
  info: jest.Mock;
  error: jest.Mock;
};
const TEST_BASE_URL = 'https://api.example.com/v1/';
const TEST_MODEL_ID = 'openai-compatible-test-model';

function createProvider(config?: Partial<LlmProviderConfig>): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    id: 'cloud-openai-compatible',
    name: 'OpenAI Compatible',
    type: 'openai-compatible',
    enabled: true,
    baseUrl: TEST_BASE_URL,
    defaultModel: TEST_MODEL_ID,
    timeoutMs: 30000,
    ...config,
  });
}

function mockResponse(response?: Partial<Response>): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      model: TEST_MODEL_ID,
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'Hello from upstream' },
        },
      ],
    }),
    text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
    ...response,
  } as unknown as Response;
}

function streamFromText(text: string): NodeJS.ReadableStream {
  return (async function* textStream() {
    yield Buffer.from(text);
  })() as unknown as NodeJS.ReadableStream;
}

function streamFromChunks(chunks: string[]): NodeJS.ReadableStream {
  return (async function* textStream() {
    for (const chunk of chunks) {
      yield Buffer.from(chunk);
    }
  })() as unknown as NodeJS.ReadableStream;
}

function getFetchOptions(index = 0): {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
} {
  return mockedFetch.mock.calls[index][1] as {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  };
}

function loggedText(): string {
  return JSON.stringify([
    ...mockedLogger.info.mock.calls.map(([payload]) => payload),
    ...mockedLogger.error.mock.calls.map(([payload]) => payload),
  ]);
}

describe('OpenAiCompatibleProvider completion', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    jest.clearAllMocks();
  });

  it('reports non-streaming OpenAI-compatible capabilities', () => {
    expect(createProvider().capabilities).toEqual({
      completion: true,
      streaming: true,
      reasoning: true,
      modelListing: true,
      modelPulling: false,
      embeddings: true,
      toolCalling: false,
      structuredOutput: false,
      tokenCounting: false,
    });
  });

  it('sends a standard chat completion request and normalizes the response', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: 'private-upstream-model',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'Assistant response',
              reasoning_content: 'Intermediate reasoning',
            },
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 7,
          total_tokens: 12,
        },
      }),
    }));

    const result = await createProvider({
      apiKey: 'secret-token',
      extraHeaders: {
        Authorization: 'Bearer wrong-token',
        'X-Provider': 'openai-compatible',
      },
    }).complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Private user prompt' }],
      temperature: 0.2,
      topP: 0.8,
      maxTokens: 128,
      stopSequences: ['END'],
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(getFetchOptions().headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-token',
      'X-Provider': 'openai-compatible',
    });
    expect(JSON.parse(getFetchOptions().body ?? '{}')).toEqual({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Private user prompt' }],
      stream: false,
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 128,
      stop: ['END'],
    });
    expect(result).toEqual({
      content: 'Assistant response',
      reasoning: 'Intermediate reasoning',
      model: TEST_MODEL_ID,
      finishReason: 'stop',
      usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 },
      latencyMs: expect.any(Number),
    });
    expect(loggedText()).not.toContain('private-upstream-model');
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'provider.complete', status: 'success', model: TEST_MODEL_ID,
      providerModelMismatch: true,
    }), 'provider.complete.success');
  });

  it('sends a standard embedding request and normalizes the response', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        object: 'list',
        model: 'private-upstream-embedding-model',
        data: [
          { object: 'embedding', index: 1, embedding: [0.3, 0.4] },
          { object: 'embedding', index: 0, embedding: [0.1, 0.2] },
        ],
        usage: {
          prompt_tokens: 6,
          total_tokens: 6,
        },
      }),
    }));

    const result = await createProvider({
      apiKey: 'secret-token',
      extraHeaders: {
        Authorization: 'Bearer wrong-token',
        'X-Provider': 'openai-compatible',
      },
    }).embed({
      model: TEST_MODEL_ID,
      input: ['Private first', 'Private second'],
      dimensions: 2,
      truncate: false,
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(getFetchOptions().headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-token',
      'X-Provider': 'openai-compatible',
    });
    expect(JSON.parse(getFetchOptions().body ?? '{}')).toEqual({
      model: TEST_MODEL_ID,
      input: ['Private first', 'Private second'],
      dimensions: 2,
    });
    expect(result).toEqual({
      providerId: 'cloud-openai-compatible',
      providerName: 'OpenAI Compatible',
      providerType: 'openai-compatible',
      model: TEST_MODEL_ID,
      embeddings: [
        { embedding: [0.1, 0.2], index: 0 },
        { embedding: [0.3, 0.4], index: 1 },
      ],
      usage: { promptTokens: 6, totalTokens: 6 },
      latencyMs: expect.any(Number),
    });
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'cloud-openai-compatible',
      providerType: 'openai-compatible',
      model: TEST_MODEL_ID,
      operation: 'provider.embed',
      status: 'started',
    }), 'provider.embed.started');
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'cloud-openai-compatible',
      providerType: 'openai-compatible',
      model: TEST_MODEL_ID,
      providerModelMismatch: true,
      operation: 'provider.embed',
      status: 'success',
      latencyMs: expect.any(Number),
    }), 'provider.embed.success');
    expect(loggedText()).not.toContain('secret-token');
    expect(loggedText()).not.toContain('Private first');
    expect(loggedText()).not.toContain('Private second');
    expect(loggedText()).not.toContain('private-upstream-embedding-model');
  });

  it('logs lifecycle fields without secrets, headers, prompts, assistant content, or reasoning', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'Assistant secret content',
              reasoning: 'Private reasoning',
            },
          },
        ],
      }),
    }));

    await createProvider({
      apiKey: 'secret-token',
      extraHeaders: { 'X-Provider-Secret': 'secret-header' },
    }).complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Private user prompt' }],
    });

    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'cloud-openai-compatible',
      providerType: 'openai-compatible',
      model: TEST_MODEL_ID,
      operation: 'provider.complete',
      status: 'started',
    }), 'provider.complete.started');
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'cloud-openai-compatible',
      providerType: 'openai-compatible',
      model: TEST_MODEL_ID,
      operation: 'provider.complete',
      status: 'success',
      latencyMs: expect.any(Number),
    }), 'provider.complete.success');
    expect(loggedText()).not.toContain('secret-token');
    expect(loggedText()).not.toContain('secret-header');
    expect(loggedText()).not.toContain('Private user prompt');
    expect(loggedText()).not.toContain('Assistant secret content');
    expect(loggedText()).not.toContain('Private reasoning');
  });

  it.each([
    [401, LlmAuthenticationError, 'AUTHENTICATION_ERROR'],
    [403, LlmAuthenticationError, 'AUTHENTICATION_ERROR'],
  ])('maps %s responses to authentication errors', async (status, errorType, code) => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'invalid api key' },
      }),
    }));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code,
      statusCode: status,
      message: 'OpenAI-compatible authentication failed',
    });
    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toBeInstanceOf(errorType);
  });

  it('maps rate-limit responses to rate-limit errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 429,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'too many requests' },
      }),
    }));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toBeInstanceOf(LlmRateLimitError);
    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'OpenAI-compatible rate limit exceeded',
    });
  });

  it('maps generic upstream HTTP failures to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 500,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'Authorization: Bearer private-api-key' },
      }),
    }));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'HTTP_500',
      statusCode: 500,
      message: 'OpenAI-compatible completion failed with status 500',
    });
  });

  it('maps aborts to timeout provider errors', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockedFetch.mockRejectedValue(abortError);

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'REQUEST_TIMEOUT',
      message: 'OpenAI-compatible completion timed out or was aborted',
    });
  });

  it('marks a confirmed adapter deadline retryable without changing the public timeout error', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('private timeout detail', 'TimeoutError'));
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const abortError = new Error('private upstream abort detail');
      abortError.name = 'AbortError';
      mockedFetch.mockRejectedValue(abortError);

      await expect(createProvider().complete({
        model: TEST_MODEL_ID,
        messages: [{ role: 'user', content: 'Hi' }],
      })).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
      expect(mockedLogger.error).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'provider.complete', status: 'error', errorCode: 'REQUEST_TIMEOUT',
        failureCategory: 'timeout', providerFailureCode: 'TIMEOUT', retryable: true,
      }), 'provider.complete.error');
      expect(loggedText()).not.toContain('private upstream abort detail');
      expect(loggedText()).not.toContain('private timeout detail');
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('maps malformed payloads to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        choices: [{ message: {} }],
      }),
    }));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MALFORMED_RESPONSE',
      message: 'OpenAI-compatible completion response was malformed',
    });
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'provider.complete', status: 'error', stage: 'response_parse',
      providerFailureCode: 'MALFORMED_RESPONSE', retryable: false,
    }), 'provider.complete.error');
  });

  it('maps invalid JSON payloads to malformed provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockRejectedValue(new SyntaxError('Bearer private-token\nprivate prompt')),
    }));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MALFORMED_RESPONSE',
      message: 'OpenAI-compatible completion response was malformed',
    });
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'provider.complete', status: 'error', errorCode: 'MALFORMED_RESPONSE',
      stage: 'response_parse', failureCategory: 'malformed_response',
      providerFailureCode: 'MALFORMED_RESPONSE', retryable: false,
      failureSite: expect.any(String), latencyMs: expect.any(Number),
    }), 'provider.complete.error');
    expect(loggedText()).not.toContain('private-token');
  });

  it.each([
    [401, LlmAuthenticationError, 'AUTHENTICATION_ERROR'],
    [403, LlmAuthenticationError, 'AUTHENTICATION_ERROR'],
  ])('maps %s embedding responses to authentication errors', async (status, errorType, code) => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'invalid api key' },
      }),
    }));

    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hi',
    })).rejects.toBeInstanceOf(errorType);
    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hi',
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code,
      statusCode: status,
      message: 'OpenAI-compatible authentication failed',
    });
  });

  it('maps embedding rate-limit responses to rate-limit errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 429,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'too many requests' },
      }),
    }));

    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hi',
    })).rejects.toBeInstanceOf(LlmRateLimitError);
    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hi',
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'OpenAI-compatible rate limit exceeded',
    });
  });

  it('maps generic embedding HTTP failures to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 500,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'upstream unavailable' },
      }),
    }));

    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hi',
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'HTTP_500',
      statusCode: 500,
      message: 'OpenAI-compatible embedding failed with status 500',
    });
  });

  it('maps embedding aborts to timeout provider errors', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockedFetch.mockRejectedValue(abortError);

    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hi',
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'REQUEST_TIMEOUT',
      message: 'OpenAI-compatible embedding timed out or was aborted',
    });
  });

  it('maps malformed embedding payloads to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        data: [{ index: 0, embedding: [0.1, 'bad'] }],
      }),
    }));

    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hi',
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MALFORMED_EMBEDDING_RESPONSE',
      message: 'OpenAI-compatible embedding response was malformed',
    });
  });

  it('streams standard chat completion SSE chunks', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: streamFromChunks([
        ': keep-alive\n\n',
        '\n',
        'data: {"choices":[{"delta":{"reasoning_content":"Step 1. "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\n',
        'data: {"choices":[{"delta":{"reasoning":"Step 2."},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }));

    const chunks = [];
    for await (const chunk of createProvider({
      apiKey: 'secret-token',
      extraHeaders: {
        Authorization: 'Bearer wrong-token',
        'X-Provider': 'openai-compatible',
      },
    }).streamComplete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Private user prompt' }],
      temperature: 0.2,
      topP: 0.8,
      maxTokens: 128,
      stopSequences: ['END'],
    })) {
      chunks.push(chunk);
    }

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(getFetchOptions().headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-token',
      'X-Provider': 'openai-compatible',
    });
    expect(JSON.parse(getFetchOptions().body ?? '{}')).toEqual({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Private user prompt' }],
      stream: true,
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 128,
      stop: ['END'],
    });
    expect(chunks).toEqual([
      { content: undefined, reasoning: 'Step 1. ', done: false, finishReason: undefined, usage: undefined },
      { content: 'Hel', reasoning: undefined, done: false, finishReason: undefined, usage: undefined },
      {
        content: 'lo',
        reasoning: undefined,
        done: false,
        finishReason: undefined,
        usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      },
      { content: undefined, reasoning: 'Step 2.', done: true, finishReason: 'stop', usage: undefined },
    ]);
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'cloud-openai-compatible',
      providerType: 'openai-compatible',
      model: TEST_MODEL_ID,
      operation: 'provider.stream',
      status: 'success',
      latencyMs: expect.any(Number),
    }), 'provider.stream.success');
    expect(loggedText()).not.toContain('secret-token');
    expect(loggedText()).not.toContain('Private user prompt');
    expect(loggedText()).not.toContain('Step 1.');
    expect(loggedText()).not.toContain('Hello');
  });

  it('treats [DONE] without a finish reason as a terminal chunk', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: streamFromText('data: {"choices":[{"delta":{"content":"Complete answer"}}]}\n\ndata: [DONE]\n\n'),
    }));

    const chunks = [];
    for await (const chunk of createProvider().streamComplete({ model: TEST_MODEL_ID, messages: [] })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: 'Complete answer', reasoning: undefined, done: false, finishReason: undefined, usage: undefined },
      { done: true },
    ]);
  });

  it('accepts a finish-reason chunk without a later [DONE] frame', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: streamFromText(
        'data: {"choices":[{"delta":{"content":"Complete answer"},"finish_reason":"stop"}]}\n\n',
      ),
    }));

    const chunks = [];
    for await (const chunk of createProvider().streamComplete({ model: TEST_MODEL_ID, messages: [] })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: 'Complete answer', reasoning: undefined, done: true, finishReason: 'stop', usage: undefined },
    ]);
  });

  it('reports clean EOF after partial output as a provider stream error', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: streamFromText('data: {"choices":[{"delta":{"content":"Partial answer"}}]}\n\n'),
    }));
    const iterator = createProvider().streamComplete({ model: TEST_MODEL_ID, messages: [] })[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ value: { content: 'Partial answer', done: false } });
    await expect(iterator.next()).rejects.toMatchObject({ code: 'UPSTREAM_STREAM_ERROR' });
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'provider.stream', status: 'error', errorCode: 'UPSTREAM_STREAM_ERROR',
    }), 'provider.stream.error');
  });

  it('maps malformed stream chunks to streaming errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: streamFromText('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: not-json\n\n'),
    }));

    const chunks = createProvider().streamComplete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    const iterator = chunks[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { content: 'partial', reasoning: undefined, done: false, finishReason: undefined, usage: undefined },
    });
    await expect(iterator.next()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MALFORMED_STREAM_CHUNK',
      message: 'OpenAI-compatible stream chunk was malformed',
    });
  });

  it('maps upstream streaming HTTP failures to streaming errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 502,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'bad gateway' },
      }),
    }));

    const chunks = createProvider().streamComplete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    await expect(chunks[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'HTTP_502',
      statusCode: 502,
      message: 'OpenAI-compatible streaming failed with status 502',
    });
  });

  it('maps streaming aborts to timeout errors', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockedFetch.mockRejectedValue(abortError);

    const chunks = createProvider().streamComplete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    await expect(chunks[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'REQUEST_TIMEOUT',
      message: 'OpenAI-compatible stream timed out or was aborted',
    });
  });

  it('lists models from the standard OpenAI-compatible endpoint', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        object: 'list',
        data: [
          { id: 'gpt-compatible-1', object: 'model' },
          { id: 'gpt-compatible-2', object: 'model' },
          { id: 42, object: 'model' },
        ],
      }),
    }));

    const result = await createProvider({
      apiKey: 'secret-token',
      extraHeaders: {
        Authorization: 'Bearer wrong-token',
        'X-Provider': 'openai-compatible',
      },
    }).listModels();

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer secret-token',
          'X-Provider': 'openai-compatible',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toEqual([
      {
        modelId: 'gpt-compatible-1',
        modelName: 'gpt-compatible-1',
        capabilities: {
          completion: 'UNKNOWN',
          streaming: 'UNKNOWN',
          reasoning: 'UNKNOWN',
          embeddings: 'UNKNOWN',
          toolCalling: 'UNKNOWN',
          structuredOutput: 'UNKNOWN',
          tokenCounting: 'UNKNOWN',
        },
      },
      {
        modelId: 'gpt-compatible-2',
        modelName: 'gpt-compatible-2',
        capabilities: {
          completion: 'UNKNOWN',
          streaming: 'UNKNOWN',
          reasoning: 'UNKNOWN',
          embeddings: 'UNKNOWN',
          toolCalling: 'UNKNOWN',
          structuredOutput: 'UNKNOWN',
          tokenCounting: 'UNKNOWN',
        },
      },
    ]);
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'cloud-openai-compatible',
      providerType: 'openai-compatible',
      operation: 'provider.listModels',
      status: 'success',
      latencyMs: expect.any(Number),
    }), 'provider.listModels.success');
    expect(loggedText()).not.toContain('secret-token');
  });

  it.each([404, 405])('maps %s model-list endpoints to unsupported listing errors', async (status) => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'not found' },
      }),
    }));

    await expect(createProvider().listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MODEL_LISTING_UNSUPPORTED',
      statusCode: status,
      message: 'OpenAI-compatible model listing is unsupported',
    });
  });

  it('maps malformed model-list payloads to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({ object: 'list' }),
    }));

    await expect(createProvider().listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MALFORMED_MODEL_LIST',
      message: 'OpenAI-compatible model list response was malformed',
    });
  });

  it('maps invalid JSON model-list payloads to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockRejectedValue(new SyntaxError('Unexpected token')),
    }));

    await expect(createProvider().listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MALFORMED_MODEL_LIST',
      message: 'OpenAI-compatible model list response was malformed',
    });
  });

  it.each([
    [401, LlmAuthenticationError, 'AUTHENTICATION_ERROR'],
    [403, LlmAuthenticationError, 'AUTHENTICATION_ERROR'],
  ])('maps %s model-list responses to authentication errors', async (status, errorType, code) => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'invalid api key' },
      }),
    }));

    await expect(createProvider().listModels()).rejects.toBeInstanceOf(errorType);
    await expect(createProvider().listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code,
      statusCode: status,
      message: 'OpenAI-compatible authentication failed',
    });
  });

  it('maps model-list rate-limit responses to rate-limit errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 429,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'too many requests' },
      }),
    }));

    await expect(createProvider().listModels()).rejects.toBeInstanceOf(LlmRateLimitError);
    await expect(createProvider().listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'OpenAI-compatible rate limit exceeded',
    });
  });

  it('maps generic model-list HTTP failures to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 502,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'bad gateway' },
      }),
    }));

    await expect(createProvider().listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'HTTP_502',
      statusCode: 502,
      message: 'OpenAI-compatible model listing failed with status 502',
    });
  });

  it('maps model-list aborts to timeout provider errors', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockedFetch.mockRejectedValue(abortError);

    await expect(createProvider().listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'REQUEST_TIMEOUT',
      message: 'OpenAI-compatible model listing timed out or was aborted',
    });
  });

  it('maps generic model-list failures to provider errors', async () => {
    mockedFetch.mockRejectedValue(new Error('connection reset'));

    await expect(createProvider().listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'LIST_MODELS_FAILED',
      message: 'OpenAI-compatible model listing failed',
    });
  });

  it('uses model listing as provider health', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        object: 'list',
        data: [{ id: TEST_MODEL_ID }],
      }),
    }));
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');

    await createProvider({ timeoutMs: undefined }).initialise();

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'cloud-openai-compatible',
      providerType: 'openai-compatible',
      operation: 'provider.initialise',
      status: 'success',
      latencyMs: expect.any(Number),
    }), 'provider.initialise.success');
    timeoutSpy.mockRestore();
  });

  it('fails provider health when model listing is unsupported', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 404,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'not found' },
      }),
    }));

    await expect(createProvider().initialise()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MODEL_LISTING_UNSUPPORTED',
      statusCode: 404,
    });
  });

  it('fails provider health when model-list payload is malformed', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({ object: 'list' }),
    }));

    await expect(createProvider().initialise()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MALFORMED_MODEL_LIST',
      message: 'OpenAI-compatible model list response was malformed',
    });
  });
});

describe('OpenAI-compatible shared lifecycle', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    jest.clearAllMocks();
  });

  function events(operation: string): Array<Record<string, unknown>> {
    return [...mockedLogger.info.mock.calls, ...mockedLogger.error.mock.calls]
      .map(([fields]) => fields as Record<string, unknown>)
      .filter((fields) => fields.operation === `provider.${operation}`);
  }

  it.each(['initialise', 'listModels', 'complete', 'embed'] as const)(
    'pairs %s start and success events with a generated operation ID', async (operation) => {
      mockedFetch.mockResolvedValue(mockResponse({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(
          operation === 'embed'
            ? { model: 'private-upstream-model', data: [{ embedding: [0.1, 0.2], index: 0 }] }
            : operation === 'complete'
              ? { model: 'private-upstream-model', choices: [{ message: { content: 'private answer' } }] }
              : { data: [{ id: TEST_MODEL_ID }] },
        ),
      }));
      const provider = createProvider();
      if (operation === 'initialise') await provider.initialise();
      if (operation === 'listModels') await provider.listModels();
      if (operation === 'complete') await provider.complete({ model: TEST_MODEL_ID, messages: [] });
      if (operation === 'embed') await provider.embed({ model: TEST_MODEL_ID, input: 'private prompt' });

      const logged = events(operation);
      expect(logged.map((event) => event.status)).toEqual(['started', 'success']);
      expect(logged[0]).toMatchObject({ layer: 'provider', providerId: 'cloud-openai-compatible', providerType: 'openai-compatible' });
      expect(logged[0].operationId).toEqual(expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
      expect(logged[1]).toMatchObject({ operationId: logged[0].operationId, latencyMs: expect.any(Number) });
      expect(logged[0].requestId).toBeUndefined();
      expect(logged[0].model).toBe(['complete', 'embed'].includes(operation) ? TEST_MODEL_ID : undefined);
      if (operation === 'complete' || operation === 'embed') expect(logged[1].providerModelMismatch).toBe(true);
      expect(JSON.stringify(logged)).not.toContain('private-upstream-model');
      expect(JSON.stringify(logged)).not.toContain('private prompt');
      expect(JSON.stringify(logged)).not.toContain('private answer');
    },
  );

  it('uses the same successful provider event schema as Ollama', async () => {
    mockedFetch.mockResolvedValueOnce(mockResponse());
    await createProvider().complete({ model: TEST_MODEL_ID, messages: [] });
    const openAiKeys = events('complete').map((event) => Object.keys(event).sort());

    jest.clearAllMocks();
    mockedFetch.mockResolvedValueOnce(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({ message: { content: 'okay' } }),
    }));
    await new OllamaProvider({
      id: 'ollama-parity', name: 'Ollama', type: 'ollama', enabled: true,
      baseUrl: 'http://localhost:11434', defaultModel: TEST_MODEL_ID,
    }).complete({ model: TEST_MODEL_ID, messages: [] });
    expect(events('complete').map((event) => Object.keys(event).sort())).toEqual(openAiKeys);
  });

  it('preserves a supplied request/job context on both events', async () => {
    mockedFetch.mockResolvedValue(mockResponse());
    const context = createLlmOperationContext({ requestId: 'trusted-request', jobId: 19 });
    await createProvider().complete({ model: TEST_MODEL_ID, messages: [] }, context);
    expect(events('complete')).toEqual([
      expect.objectContaining({ operationId: context.operationId, requestId: 'trusted-request', jobId: 19, status: 'started' }),
      expect.objectContaining({ operationId: context.operationId, requestId: 'trusted-request', jobId: 19, status: 'success' }),
    ]);
  });

  it('does not emit events for disabled initialization', async () => {
    await createProvider({ enabled: false }).initialise();
    expect(events('initialise')).toHaveLength(0);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('leaves an unconsumed stream idle and aborts an early-closed SSE reader', async () => {
    let readerClosed = false;
    mockedFetch.mockResolvedValue(mockResponse({
      body: (async function* cancellableSse() {
        try {
          yield Buffer.from('data: {"choices":[{"delta":{"content":"first"}}]}\n\n');
          yield Buffer.from('data: {"choices":[{"delta":{"content":"second"}}]}\n\n');
        } finally {
          readerClosed = true;
        }
      })() as unknown as NodeJS.ReadableStream,
    }));
    const iterator = createProvider().streamComplete({ model: TEST_MODEL_ID, messages: [] })[Symbol.asyncIterator]();
    expect(events('stream')).toHaveLength(0);
    expect(mockedFetch).not.toHaveBeenCalled();
    await iterator.next();
    await iterator.return?.();
    expect(readerClosed).toBe(true);
    const logged = events('stream');
    expect(logged.map((event) => event.status)).toEqual(['started', 'aborted']);
    expect(logged[1]).toMatchObject({ operationId: logged[0].operationId, stage: 'local_abort', latencyMs: expect.any(Number) });
  });

  it('logs one safe terminal error after a partial SSE response', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: (async function* brokenSse() {
        yield Buffer.from('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
        throw new Error('Bearer private-token\nprivate answer');
      })() as unknown as NodeJS.ReadableStream,
    }));
    const iterator = createProvider().streamComplete({ model: TEST_MODEL_ID, messages: [] })[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { content: 'partial' } });
    await expect(iterator.next()).rejects.toMatchObject({ code: 'UPSTREAM_STREAM_ERROR', message: 'OpenAI-compatible stream failed' });
    const logged = events('stream');
    expect(logged.map((event) => event.status)).toEqual(['started', 'error']);
    expect(logged[1]).toMatchObject({
      operationId: logged[0].operationId, stage: 'stream_read', failureCategory: 'stream',
      providerFailureCode: 'STREAM_ERROR', failureSite: expect.any(String), latencyMs: expect.any(Number),
    });
    expect(JSON.stringify(logged)).not.toContain('private-token');
  });

  it.each([
    [401, 'PROVIDER_AUTHENTICATION_ERROR', 'authentication', false],
    [403, 'PROVIDER_AUTHENTICATION_ERROR', 'authentication', false],
    [429, 'RATE_LIMITED', 'rate_limit', true],
  ] as const)('keeps HTTP %i public and internal failure details separate', async (status, code, category, retryable) => {
    mockedFetch.mockResolvedValue(mockResponse({ ok: false, status }));
    await expect(createProvider().complete({ model: TEST_MODEL_ID, messages: [] }))
      .rejects.toMatchObject({ statusCode: status });
    const logged = events('complete');
    expect(logged.map((event) => event.status)).toEqual(['started', 'error']);
    expect(logged[1]).toMatchObject({
      operationId: logged[0].operationId, errorCode: code, upstreamStatus: status,
      failureCategory: category, retryable, latencyMs: expect.any(Number),
    });
  });
});
