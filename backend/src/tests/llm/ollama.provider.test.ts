import fetch, { Response } from 'node-fetch';
import { jest } from '@jest/globals';
import { logger } from '../../config/logger';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';
import { LlmProviderConfig, LlmStreamingError } from '../../modules/llm/llm.types';
import { createLlmOperationContext } from '../../modules/llm/llm.operation';

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
        model: 'private-upstream-embedding-model',
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
      model: TEST_MODEL_ID,
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
      model: TEST_MODEL_ID,
      providerModelMismatch: true,
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
    expect(logText).not.toContain('private-upstream-embedding-model');
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
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'provider.embed', status: 'error', stage: 'response_parse',
      providerFailureCode: 'MALFORMED_RESPONSE', retryable: false,
    }), 'provider.embed.error');
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
      message: 'Ollama embedding failed with status 500',
    });
  });
});

describe('OllamaProvider upstream failure privacy', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('preserves the safe HTTP status for a failed health check', async () => {
    mockedFetch.mockResolvedValue(mockResponse({ ok: false, status: 503 }));

    await expect(createProvider().initialise()).rejects.toMatchObject({
      code: 'HEALTH_CHECK_FAILED',
      statusCode: 503,
      message: 'Ollama health check failed with status 503',
    });
  });

  it('exposes the HTTP status, but not the upstream body, when model listing fails', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 503,
      text: jest.fn<() => Promise<string>>().mockResolvedValue('Bearer private-api-key'),
    }));

    await expect(createProvider().listModels()).rejects.toMatchObject({
      code: 'HTTP_503',
      statusCode: 503,
      message: 'Ollama model listing failed with status 503',
    });
  });

  it('does not expose fetch error details from completion', async () => {
    mockedFetch.mockRejectedValue(new Error('Authorization: Bearer private-api-key'));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({
      providerId: 'local-ollama',
      code: 'UPSTREAM_ERROR',
      message: 'Ollama completion failed',
    });
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'provider.complete', status: 'error', errorCode: 'UPSTREAM_ERROR',
      stage: 'upstream_request', failureCategory: 'unknown', providerFailureCode: 'UNKNOWN',
      failureSite: expect.any(String), latencyMs: expect.any(Number),
    }), 'provider.complete.error');
    expect(JSON.stringify(mockedLogger.error.mock.calls)).not.toContain('private-api-key');
  });

  it('distinguishes invalid JSON internally while keeping the established public error', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockRejectedValue(new SyntaxError('Bearer private-token\nprivate prompt')),
    }));

    await expect(createProvider().complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', message: 'Ollama completion failed' });
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'provider.complete', status: 'error', errorCode: 'UPSTREAM_ERROR',
      stage: 'response_parse', failureCategory: 'malformed_response',
      providerFailureCode: 'MALFORMED_RESPONSE', retryable: false,
    }), 'provider.complete.error');
    expect(JSON.stringify(mockedLogger.error.mock.calls)).not.toContain('private-token');
  });

  it.each(['listModels', 'pullModel'] as const)('does not expose fetch error details from %s', async (operation) => {
    mockedFetch.mockRejectedValue(new Error('Authorization: Bearer private-api-key'));

    const provider = createProvider();
    const result = operation === 'listModels'
      ? provider.listModels()
      : provider.pullModel(TEST_MODEL_ID);

    await expect(result).rejects.toMatchObject({
      providerId: 'local-ollama',
      code: operation === 'listModels' ? 'LIST_MODELS_FAILED' : 'PULL_MODEL_FAILED',
      message: operation === 'listModels' ? 'Failed to list Ollama models' : 'Failed to pull Ollama model',
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
      message: 'Ollama streaming failed with status 503',
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

describe('OllamaProvider shared lifecycle', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    jest.clearAllMocks();
  });

  function events(operation: string): Array<Record<string, unknown>> {
    return [...mockedLogger.info.mock.calls, ...mockedLogger.error.mock.calls]
      .map(([fields]) => fields as Record<string, unknown>)
      .filter((fields) => fields.operation === `provider.${operation}`);
  }

  it('generates its own operation ID even when runtime correlation has a forged ID', () => {
    const forgedId = '00000000-0000-4000-8000-000000000000';
    const runtimeCorrelation = {
      requestId: 'trusted-request', jobId: 42, operationId: forgedId, privateText: 'private payload',
    };
    const context = createLlmOperationContext(runtimeCorrelation);
    expect(context).toEqual({
      operationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      requestId: 'trusted-request',
      jobId: 42,
    });
    expect(context.operationId).not.toBe(forgedId);
  });

  it.each(['initialise', 'listModels', 'complete', 'embed', 'pullModel'] as const)(
    'pairs %s events with a generated operation ID and terminal latency', async (operation) => {
      mockedFetch.mockResolvedValue(mockResponse({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(
          operation === 'embed' ? { embeddings: [[0.1, 0.2]] }
            : operation === 'complete' ? { message: { content: 'private answer' } }
              : { models: [{ name: TEST_MODEL_ID }] },
        ),
      }));
      const provider = createProvider();
      if (operation === 'initialise') await provider.initialise();
      if (operation === 'listModels') await provider.listModels();
      if (operation === 'complete') await provider.complete({ model: TEST_MODEL_ID, messages: [] });
      if (operation === 'embed') await provider.embed({ model: TEST_MODEL_ID, input: 'private prompt' });
      if (operation === 'pullModel') await provider.pullModel(TEST_MODEL_ID);

      const logged = events(operation);
      expect(logged).toHaveLength(2);
      expect(logged.map((event) => event.status)).toEqual(['started', 'success']);
      expect(logged[0]).toMatchObject({ layer: 'provider', providerId: 'local-ollama', providerType: 'ollama' });
      expect(logged[0].operationId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
      expect(logged[1]).toMatchObject({ operationId: logged[0].operationId, latencyMs: expect.any(Number) });
      expect(logged[0].requestId).toBeUndefined();
      expect(logged[0].model).toBe(['complete', 'embed', 'pullModel'].includes(operation) ? TEST_MODEL_ID : undefined);
      expect(JSON.stringify(logged)).not.toContain('private prompt');
      expect(JSON.stringify(logged)).not.toContain('private answer');
    },
  );

  it('carries a trusted request ID and job ID without inventing either for direct calls', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue({ message: { content: 'okay' } }),
    }));
    const context = createLlmOperationContext({ requestId: 'trusted-request', jobId: 42 });
    await createProvider().complete({ model: TEST_MODEL_ID, messages: [] }, context);
    expect(events('complete')).toEqual([
      expect.objectContaining({ operationId: context.operationId, requestId: 'trusted-request', jobId: 42, status: 'started' }),
      expect.objectContaining({ operationId: context.operationId, requestId: 'trusted-request', jobId: 42, status: 'success' }),
    ]);
  });

  it('does not start an unconsumed stream and marks an early close aborted', async () => {
    let readerClosed = false;
    mockedFetch.mockResolvedValue(mockResponse({
      body: (async function* cancellableStream() {
        try {
          yield Buffer.from('{"message":{"content":"first"},"done":false}\n');
          yield Buffer.from('{"message":{"content":"second"},"done":false}\n');
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
    expect(logged[1]).toMatchObject({ operationId: logged[0].operationId, latencyMs: expect.any(Number), stage: 'local_abort' });
    expect(logged[0].model).toBe(TEST_MODEL_ID);
  });

  it('pairs a fully consumed stream with one success event', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: streamFromLines([{ message: { content: 'done' }, done: true }]),
    }));
    const chunks = [];
    for await (const chunk of createProvider().streamComplete({ model: TEST_MODEL_ID, messages: [] })) chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    const logged = events('stream');
    expect(logged.map((event) => event.status)).toEqual(['started', 'success']);
    expect(logged[1]).toMatchObject({ operationId: logged[0].operationId, latencyMs: expect.any(Number) });
  });

  it('reports clean EOF after partial output as a provider stream error', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      body: streamFromLines([{ message: { content: 'Partial answer' }, done: false }]),
    }));
    const iterator = createProvider().streamComplete({ model: TEST_MODEL_ID, messages: [] })[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ value: { content: 'Partial answer', done: false } });
    await expect(iterator.next()).rejects.toMatchObject({ code: 'UPSTREAM_STREAM_ERROR' });
    expect(events('stream').map((event) => event.status)).toEqual(['started', 'error']);
    expect(events('stream')[1]).toMatchObject({ errorCode: 'UPSTREAM_STREAM_ERROR' });
  });

  it('keeps skipped initialization free of lifecycle events', async () => {
    await createProvider({ enabled: false }).initialise();
    expect(events('initialise')).toHaveLength(0);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('records a confirmed deadline without exposing the abort reason', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('private timeout reason', 'TimeoutError'));
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const abortError = new Error('private upstream abort');
      abortError.name = 'AbortError';
      mockedFetch.mockRejectedValue(abortError);
      await expect(createProvider().complete({ model: TEST_MODEL_ID, messages: [] }))
        .rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', message: 'Ollama completion failed' });
      const logged = events('complete');
      expect(logged.map((event) => event.status)).toEqual(['started', 'error']);
      expect(logged[1]).toMatchObject({
        operationId: logged[0].operationId, failureCategory: 'timeout', providerFailureCode: 'TIMEOUT',
        retryable: true, latencyMs: expect.any(Number),
      });
      expect(JSON.stringify(logged)).not.toContain('private timeout reason');
      expect(JSON.stringify(logged)).not.toContain('private upstream abort');
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('emits one safe terminal error after a partial stream and retains the original public error', async () => {
    const privateError = new Error('Bearer private-token\nprivate prompt');
    mockedFetch.mockResolvedValue(mockResponse({
      body: (async function* brokenStream() {
        yield Buffer.from('{"message":{"content":"first"},"done":false}\n');
        throw privateError;
      })() as unknown as NodeJS.ReadableStream,
    }));
    const iterator = createProvider().streamComplete({ model: TEST_MODEL_ID, messages: [] })[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { content: 'first' } });
    await expect(iterator.next()).rejects.toMatchObject({ code: 'UPSTREAM_STREAM_ERROR', message: 'Ollama stream failed' });
    const logged = events('stream');
    expect(logged.map((event) => event.status)).toEqual(['started', 'error']);
    expect(logged[1]).toMatchObject({
      operationId: logged[0].operationId, stage: 'stream_read', failureCategory: 'stream',
      providerFailureCode: 'STREAM_ERROR', failureSite: expect.any(String), latencyMs: expect.any(Number),
    });
    expect(JSON.stringify(logged)).not.toContain('private-token');
  });

  it('retains status and diagnostic category for an upstream HTTP failure', async () => {
    mockedFetch.mockResolvedValue(mockResponse({ ok: false, status: 503 }));
    await expect(createProvider().listModels()).rejects.toMatchObject({ code: 'HTTP_503', statusCode: 503 });
    const logged = events('listModels');
    expect(logged.map((event) => event.status)).toEqual(['started', 'error']);
    expect(logged[1]).toMatchObject({
      operationId: logged[0].operationId, errorCode: 'HTTP_503', upstreamStatus: 503,
      failureCategory: 'http', providerFailureCode: 'HTTP_ERROR', retryable: true,
      failureSite: expect.any(String), latencyMs: expect.any(Number),
    });
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
