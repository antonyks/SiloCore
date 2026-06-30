import fetch, { Response } from 'node-fetch';
import { jest } from '@jest/globals';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';
import { LlmProviderConfig, LlmStreamingError } from '../../modules/llm/llm.types';

jest.mock('node-fetch', () => jest.fn());

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;
const TEST_BASE_URL = 'http://localhost:11434';

function createProvider(config?: Partial<LlmProviderConfig>): OllamaProvider {
  return new OllamaProvider({
    id: 'local-ollama',
    name: 'Local Ollama',
    type: 'ollama',
    enabled: true,
    baseUrl: TEST_BASE_URL,
    defaultModel: 'llama2',
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
        model: 'llama2',
        message: { content: 'Hello' },
      }),
    }));

    await createProvider().complete({
      model: 'llama2',
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
      model: 'llama2',
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

    await createProvider().pullModel('llama2');

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
    expect(mockedFetch).toHaveBeenCalledWith(
      `${TEST_BASE_URL}/api/pull`,
      expect.objectContaining({ signal }),
    );
  });
});

describe('OllamaProvider headers', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
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
        model: 'llama2',
        message: { content: 'Hello' },
      }),
    }));

    await createProvider({
      apiKey: 'secret-token',
      extraHeaders: { 'X-Provider': 'ollama' },
    }).complete({
      model: 'llama2',
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
      model: 'llama2',
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
    }).pullModel('llama2');

    expect(getFetchOptions().headers).toEqual({
      'Content-Type': 'application/json',
      'X-Provider': 'ollama',
      Authorization: 'Bearer secret-token',
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
});

describe('OllamaProvider streaming errors', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('throws LlmStreamingError for failed streaming responses', async () => {
    mockedFetch.mockResolvedValue(mockResponse({
      ok: false,
      status: 503,
      text: jest.fn<() => Promise<string>>().mockResolvedValue('model unavailable'),
    }));

    const chunks = createProvider().streamComplete({
      model: 'llama2',
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
  });
});
