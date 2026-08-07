import fetch, { Response } from 'node-fetch';
import { jest } from '@jest/globals';
import { logger } from '../../config/logger';
import { OpenAiCompatibleProvider } from '../../modules/llm/providers/openaiCompatible.provider';
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
      modelListing: false,
      modelPulling: false,
      embeddings: false,
      toolCalling: false,
      structuredOutput: false,
      tokenCounting: false,
    });
  });

  it('sends a standard chat completion request and normalizes the response', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: 'upstream-model',
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
      model: 'upstream-model',
      finishReason: 'stop',
      usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 },
      latencyMs: expect.any(Number),
    });
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
      message: 'OpenAI-compatible authentication failed: invalid api key',
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
      message: 'OpenAI-compatible rate limit exceeded: too many requests',
    });
  });

  it('maps generic upstream HTTP failures to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 500,
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        error: { message: 'upstream unavailable' },
      }),
    }));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'HTTP_500',
      statusCode: 500,
      message: 'OpenAI-compatible completion failed with status 500: upstream unavailable',
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
  });

  it('maps invalid JSON payloads to malformed provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockRejectedValue(new SyntaxError('Unexpected token')),
    }));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MALFORMED_RESPONSE',
      message: 'OpenAI-compatible completion response was malformed',
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
      message: 'OpenAI-compatible streaming failed with status 502: bad gateway',
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

  it('throws unsupported errors for model listing', async () => {
    const provider = createProvider();

    await expect(provider.listModels()).rejects.toMatchObject({
      providerId: 'cloud-openai-compatible',
      code: 'MODEL_LISTING_UNSUPPORTED',
    });
  });
});
