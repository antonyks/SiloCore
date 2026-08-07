import fetch, { Response } from 'node-fetch';
import { jest } from '@jest/globals';
import { logger } from '../../config/logger';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';
import { LlmProviderConfig, LlmStreamingError } from '../../modules/llm/llm.types';

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
const TEST_BASE_URL = 'http://localhost:11434';
const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;

function createProvider(config?: Partial<LlmProviderConfig>): OllamaProvider {
  return new OllamaProvider({
    id: 'local-ollama',
    name: 'Local Ollama',
    type: 'ollama',
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
    json: jest.fn<() => Promise<unknown>>().mockResolvedValue({ models: [] }),
    text: jest.fn<() => Promise<string>>().mockResolvedValue(''),
    body: (async function* emptyStream() {})(),
    ...response,
  } as unknown as Response;
}

function streamFromLines(lines: unknown[]): NodeJS.ReadableStream {
  return (async function* lineStream() {
    for (const line of lines) {
      yield Buffer.from(`${JSON.stringify(line)}\n`);
    }
  })() as unknown as NodeJS.ReadableStream;
}

function getFetchOptions(index = 0): {
  headers?: Record<string, string>;
  signal?: AbortSignal;
} {
  return mockedFetch.mock.calls[index][1] as {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  };
}

describe('OllamaProvider timeouts', () => {
  let timeoutSpy: jest.SpiedFunction<typeof AbortSignal.timeout>;
  let signal: AbortSignal;

  beforeEach(() => {
    signal = new AbortController().signal;
    timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    mockedFetch.mockReset();
  });

  afterEach(() => {
    timeoutSpy.mockRestore();
  });

  it('uses a default health-check timeout when no timeout is configured', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    await createProvider({ timeoutMs: undefined }).initialise();

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(mockedFetch).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/tags`,
      expect.objectContaining({ signal }),
    );
  });

  it('passes configured timeout signal to complete requests', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        message: { content: 'Hello' },
      }),
    }));

    await createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
    expect(mockedFetch).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/chat`,
      expect.objectContaining({ signal }),
    );
  });

  it('passes configured timeout signal to streaming requests', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    const chunks = createProvider().streamComplete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    await chunks[Symbol.asyncIterator]().next();

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
    expect(mockedFetch).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/chat`,
      expect.objectContaining({ signal }),
    );
  });

  it('passes configured timeout signal when listing models', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    await createProvider().listModels();

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
    expect(mockedFetch).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/tags`,
      expect.objectContaining({ signal }),
    );
  });

  it('passes configured timeout signal when pulling models', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    await createProvider().pullModel(TEST_MODEL_ID);

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
    expect(mockedFetch).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/pull`,
      expect.objectContaining({ signal }),
    );
  });

  it('passes configured timeout signal to embedding requests', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        embeddings: [[0.1, 0.2]],
      }),
    }));

    await createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hello',
    });

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
    expect(mockedFetch).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/embed`,
      expect.objectContaining({ signal }),
    );
  });
});

describe('OllamaProvider headers', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    jest.clearAllMocks();
  });

  it('passes api key and extra headers to health checks', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    await createProvider({
      apiKey: 'secret-token',
      extraHeaders: { 'X-Provider': 'ollama' },
    }).initialise();

    expect(getFetchOptions().headers).toEqual({
      'X-Provider': 'ollama',
      Authorization: 'Bearer secret-token',
    });
  });

  it('passes api key, extra headers, and content type to complete requests', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        message: { content: 'Hello' },
      }),
    }));

    await createProvider({
      apiKey: 'secret-token',
      extraHeaders: { 'X-Provider': 'ollama' },
    }).complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(getFetchOptions().headers).toEqual({
      'Content-Type': 'application/json',
      'X-Provider': 'ollama',
      Authorization: 'Bearer secret-token',
    });
  });

  it('passes api key, extra headers, and content type to streaming requests', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    const chunks = createProvider({
      apiKey: 'secret-token',
      extraHeaders: { 'X-Provider': 'ollama' },
    }).streamComplete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    await chunks[Symbol.asyncIterator]().next();

    expect(getFetchOptions().headers).toEqual({
      'Content-Type': 'application/json',
      'X-Provider': 'ollama',
      Authorization: 'Bearer secret-token',
    });
  });

  it('passes api key and extra headers when listing models', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    await createProvider({
      apiKey: 'secret-token',
      extraHeaders: { 'X-Provider': 'ollama' },
    }).listModels();

    expect(getFetchOptions().headers).toEqual({
      'X-Provider': 'ollama',
      Authorization: 'Bearer secret-token',
    });
  });

  it('passes api key, extra headers, and content type when pulling models', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    await createProvider({
      apiKey: 'secret-token',
      extraHeaders: { 'X-Provider': 'ollama' },
    }).pullModel(TEST_MODEL_ID);

    expect(getFetchOptions().headers).toEqual({
      'Content-Type': 'application/json',
      'X-Provider': 'ollama',
      Authorization: 'Bearer secret-token',
    });
  });

  it('passes api key, extra headers, and content type to embedding requests', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        embeddings: [[0.1, 0.2]],
      }),
    }));

    await createProvider({
      apiKey: 'secret-token',
      extraHeaders: { 'X-Provider': 'ollama' },
    }).embed({
      model: TEST_MODEL_ID,
      input: ['Private first', 'Private second'],
      dimensions: 2,
      truncate: false,
    });

    expect(getFetchOptions().headers).toEqual({
      'Content-Type': 'application/json',
      'X-Provider': 'ollama',
      Authorization: 'Bearer secret-token',
    });
    expect(JSON.parse((mockedFetch.mock.calls[0][1] as { body?: string }).body ?? '{}')).toEqual({
      model: TEST_MODEL_ID,
      input: ['Private first', 'Private second'],
      dimensions: 2,
      truncate: false,
    });
  });

  it('lets apiKey take precedence over Authorization from extra headers', async () => {
    mockedFetch.mockResolvedValue(mockResponse());

    await createProvider({
      apiKey: 'secret-token',
      extraHeaders: { Authorization: 'Bearer wrong-token' },
    }).listModels();

    expect(getFetchOptions().headers).toEqual({
      Authorization: 'Bearer secret-token',
    });
  });

  it('logs complete lifecycle fields without secrets, headers, prompts, or assistant content', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        message: { content: 'Assistant secret content' },
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
      providerId: 'local-ollama',
      providerType: 'ollama',
      model: TEST_MODEL_ID,
      operation: 'provider.complete',
      status: 'started',
    }), 'provider.complete.started');
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'local-ollama',
      providerType: 'ollama',
      model: TEST_MODEL_ID,
      operation: 'provider.complete',
      status: 'success',
      latencyMs: expect.any(Number),
    }), 'provider.complete.success');

    const logText = JSON.stringify([
      ...mockedLogger.info.mock.calls.map(([payload]) => payload),
      ...mockedLogger.error.mock.calls.map(([payload]) => payload),
    ]);
    expect(logText).not.toContain('secret-token');
    expect(logText).not.toContain('secret-header');
    expect(logText).not.toContain('Private user prompt');
    expect(logText).not.toContain('Assistant secret content');
  });
});

describe('OllamaProvider capabilities', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    jest.clearAllMocks();
  });

  it('reports adapter capabilities for implemented Ollama operations', () => {
    expect(createProvider().capabilities).toEqual({
      completion: true,
      streaming: true,
      reasoning: true,
      modelListing: true,
      modelPulling: true,
      embeddings: true,
      toolCalling: false,
      structuredOutput: false,
      tokenCounting: false,
    });
  });

  it('reports listed model capabilities as UNKNOWN when Ollama tags omit metadata', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        models: [{ name: TEST_MODEL_ID }],
      }),
    }));

    await expect(createProvider().listModels()).resolves.toEqual([
      {
        modelId: TEST_MODEL_ID,
        modelName: TEST_MODEL_ID,
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
  });
});

describe('OllamaProvider embeddings', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    jest.clearAllMocks();
  });

  it('normalizes successful embedding responses', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: 'embedding-model',
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        prompt_eval_count: 9,
      }),
    }));

    const result = await createProvider().embed({
      model: TEST_MODEL_ID,
      input: ['Private first', 'Private second'],
    });

    expect(result).toEqual({
      providerId: 'local-ollama',
      providerName: 'Local Ollama',
      providerType: 'ollama',
      model: 'embedding-model',
      embeddings: [
        { embedding: [0.1, 0.2], index: 0 },
        { embedding: [0.3, 0.4], index: 1 },
      ],
      usage: { promptTokens: 9, totalTokens: 9 },
      latencyMs: expect.any(Number),
    });
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'local-ollama',
      providerType: 'ollama',
      model: TEST_MODEL_ID,
      operation: 'provider.embed',
      status: 'started',
    }), 'provider.embed.started');
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'local-ollama',
      providerType: 'ollama',
      model: 'embedding-model',
      operation: 'provider.embed',
      status: 'success',
      latencyMs: expect.any(Number),
    }), 'provider.embed.success');
    const logText = JSON.stringify([
      ...mockedLogger.info.mock.calls.map(([payload]) => payload),
      ...mockedLogger.error.mock.calls.map(([payload]) => payload),
    ]);
    expect(logText).not.toContain('Private first');
    expect(logText).not.toContain('Private second');
  });

  it('rejects malformed embedding responses', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        embeddings: [[0.1, 'bad']],
      }),
    }));

    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hello',
    })).rejects.toMatchObject({
      providerId: 'local-ollama',
      code: 'MALFORMED_EMBEDDING_RESPONSE',
      message: 'Ollama embedding response was malformed',
    });
  });

  it('maps embedding HTTP failures to provider errors', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 500,
      text: jest.fn<() => Promise<string>>().mockResolvedValue('embedding failed'),
    }));

    await expect(createProvider().embed({
      model: TEST_MODEL_ID,
      input: 'Hello',
    })).rejects.toMatchObject({
      providerId: 'local-ollama',
      code: 'HTTP_500',
      statusCode: 500,
      message: 'Ollama embedding error: embedding failed',
    });
  });
});

describe('OllamaProvider streaming errors', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    jest.clearAllMocks();
  });

  it('throws LlmStreamingError for failed streaming responses', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 503,
      text: jest.fn<() => Promise<string>>().mockResolvedValue('model unavailable'),
    }));

    const chunks = createProvider().streamComplete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    const nextChunk = chunks[Symbol.asyncIterator]().next();

    await expect(nextChunk).rejects.toBeInstanceOf(LlmStreamingError);
    await expect(nextChunk).rejects.toMatchObject({
      name: 'LlmProviderError',
      providerId: 'local-ollama',
      code: 'HTTP_503',
      statusCode: 503,
      message: 'Ollama streaming error: model unavailable',
    });
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'local-ollama',
      providerType: 'ollama',
      model: TEST_MODEL_ID,
      operation: 'provider.stream',
      status: 'error',
      errorCode: 'HTTP_503',
      latencyMs: expect.any(Number),
    }), 'provider.stream.error');
  });
});

describe('OllamaProvider reasoning output', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('normalizes non-streaming thinking output to reasoning', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        model: TEST_MODEL_ID,
        done_reason: 'stop',
        message: {
          content: 'Final answer',
          thinking: 'Reason through the problem.',
        },
      }),
    }));

    const result = await createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result).toMatchObject({
      content: 'Final answer',
      reasoning: 'Reason through the problem.',
      finishReason: 'stop',
    });
  });

  it('normalizes streamed thinking chunks to reasoning', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: streamFromLines([
        { message: { thinking: 'Step 1. ' }, done: false },
        { message: { content: 'Final' }, done: false },
        { message: { reasoning_content: 'Step 2.' }, done: false },
        { done: true, done_reason: 'length', prompt_eval_count: 1, eval_count: 2 },
      ]),
    }));

    const chunks = [];
    for await (const chunk of createProvider().streamComplete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { content: undefined, reasoning: 'Step 1. ', done: false, usage: undefined },
      { content: 'Final', reasoning: undefined, done: false, usage: undefined },
      { content: undefined, reasoning: 'Step 2.', done: false, usage: undefined },
      {
        content: undefined,
        reasoning: undefined,
        done: true,
        finishReason: 'length',
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      },
    ]);
  });
});
