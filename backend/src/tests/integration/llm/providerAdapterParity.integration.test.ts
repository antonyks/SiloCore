import { ServerResponse } from 'node:http';
import { logger } from '../../../config/logger';
import { LlmStreamingError } from '../../../modules/llm/llm.types';
import { OllamaProvider } from '../../../modules/llm/providers/ollama.provider';
import { OpenAiCompatibleProvider } from '../../../modules/llm/providers/openaiCompatible.provider';
import {
  createMockLlmUpstream,
  MockLlmUpstream,
  sendChunksThenDestroy,
  sendJson,
  sendText,
} from '../helpers/mockLlmUpstream';

const TEST_MODEL_ID = 'parity-model';
const SECRET_TOKEN = 'secret-token';
const SECRET_HEADER = 'secret-extra-header';
const PRIVATE_PROMPT = 'Private parity prompt';
const PRIVATE_REASONING = 'Private parity reasoning';
const PRIVATE_ANSWER = 'Private parity answer';

function createOllamaProvider(upstream: MockLlmUpstream): OllamaProvider {
  return new OllamaProvider({
    id: 'ollama-parity',
    name: 'Ollama Parity',
    type: 'ollama',
    enabled: true,
    baseUrl: upstream.baseUrl,
    defaultModel: TEST_MODEL_ID,
    timeoutMs: 5000,
    apiKey: SECRET_TOKEN,
    extraHeaders: { 'X-Secret-Header': SECRET_HEADER },
  });
}

function createOpenAiProvider(upstream: MockLlmUpstream): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    id: 'openai-parity',
    name: 'OpenAI Parity',
    type: 'openai-compatible',
    enabled: true,
    baseUrl: upstream.baseUrl,
    defaultModel: TEST_MODEL_ID,
    timeoutMs: 5000,
    apiKey: SECRET_TOKEN,
    extraHeaders: { 'X-Secret-Header': SECRET_HEADER },
  });
}

function createOllamaRoutes() {
  return {
    'POST /api/chat': (request: { body: string }, res: ServerResponse) => {
      const body = JSON.parse(request.body) as { stream?: boolean };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.write(`${JSON.stringify({ message: { reasoning_content: PRIVATE_REASONING }, done: false })}\n`);
        res.write(`${JSON.stringify({ message: { content: PRIVATE_ANSWER }, done: false })}\n`);
        res.write(`${JSON.stringify({
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 3,
          eval_count: 4,
        })}\n`);
        res.end();
        return;
      }

      sendJson(res, 200, {
        model: TEST_MODEL_ID,
        message: {
          content: PRIVATE_ANSWER,
          reasoning_content: PRIVATE_REASONING,
        },
        done_reason: 'stop',
        prompt_eval_count: 3,
        eval_count: 4,
      });
    },
    'GET /api/tags': (_request: unknown, res: ServerResponse) => {
      sendJson(res, 200, { models: [{ name: TEST_MODEL_ID }] });
    },
    'POST /api/embed': (_request: unknown, res: ServerResponse) => {
      sendJson(res, 200, {
        model: TEST_MODEL_ID,
        embeddings: [[0.1, 0.2], [0.3, 0.4]],
        prompt_eval_count: 6,
      });
    },
  };
}

function createOpenAiRoutes() {
  return {
    'POST /chat/completions': (request: { body: string }, res: ServerResponse) => {
      const body = JSON.parse(request.body) as { stream?: boolean };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: PRIVATE_REASONING } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: PRIVATE_ANSWER } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      sendJson(res, 200, {
        model: TEST_MODEL_ID,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: PRIVATE_ANSWER,
              reasoning_content: PRIVATE_REASONING,
            },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      });
    },
    'GET /models': (_request: unknown, res: ServerResponse) => {
      sendJson(res, 200, { object: 'list', data: [{ id: TEST_MODEL_ID, object: 'model' }] });
    },
    'POST /embeddings': (_request: unknown, res: ServerResponse) => {
      sendJson(res, 200, {
        object: 'list',
        model: TEST_MODEL_ID,
        data: [
          { object: 'embedding', index: 0, embedding: [0.1, 0.2] },
          { object: 'embedding', index: 1, embedding: [0.3, 0.4] },
        ],
        usage: { prompt_tokens: 6, total_tokens: 6 },
      });
    },
  };
}

function createOllamaErrorRoutes() {
  return {
    'POST /api/chat': (_request: unknown, res: ServerResponse) => {
      sendText(res, 503, 'deterministic failure');
    },
  };
}

function createOpenAiErrorRoutes() {
  return {
    'POST /chat/completions': (_request: unknown, res: ServerResponse) => {
      sendJson(res, 503, { error: { message: 'deterministic failure' } });
    },
  };
}

function createOllamaPartialStreamFailureRoutes() {
  return {
    'POST /api/chat': (_request: unknown, res: ServerResponse) => {
      sendChunksThenDestroy(
        res,
        'application/x-ndjson',
        [`${JSON.stringify({ message: { content: 'partial' }, done: false })}\n`],
      );
    },
  };
}

function createOpenAiPartialStreamFailureRoutes() {
  return {
    'POST /chat/completions': (_request: unknown, res: ServerResponse) => {
      sendChunksThenDestroy(
        res,
        'text/event-stream',
        [`data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' } }] })}\n\n`],
      );
    },
  };
}

function redactLatency<T extends { latencyMs?: number }>(value: T): Omit<T, 'latencyMs'> {
  const { latencyMs: _latencyMs, ...withoutLatency } = value;
  void _latencyMs;
  return withoutLatency;
}

async function collectStream(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function loggedPayloadText(): string {
  return JSON.stringify([
    ...jest.mocked(logger.info).mock.calls.map(([payload]) => payload),
    ...jest.mocked(logger.error).mock.calls.map(([payload]) => payload),
  ]);
}

describe('LLM provider adapter parity integration', () => {
  let ollamaUpstream: MockLlmUpstream;
  let openAiUpstream: MockLlmUpstream;

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    ollamaUpstream = await createMockLlmUpstream(createOllamaRoutes());
    openAiUpstream = await createMockLlmUpstream(createOpenAiRoutes());
  });

  afterEach(async () => {
    await Promise.all([
      ollamaUpstream.close(),
      openAiUpstream.close(),
    ]);
    jest.restoreAllMocks();
  });

  it('normalizes completion responses to compatible internal shapes', async () => {
    const request = {
      model: TEST_MODEL_ID,
      messages: [{ role: 'user' as const, content: PRIVATE_PROMPT }],
    };

    const ollama = await createOllamaProvider(ollamaUpstream).complete(request);
    const openAi = await createOpenAiProvider(openAiUpstream).complete(request);

    expect(redactLatency(ollama)).toEqual(redactLatency(openAi));
    expect(redactLatency(ollama)).toEqual({
      content: PRIVATE_ANSWER,
      reasoning: PRIVATE_REASONING,
      model: TEST_MODEL_ID,
      finishReason: 'stop',
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    });
  });

  it('normalizes streaming responses to compatible internal chunk shapes', async () => {
    const request = {
      model: TEST_MODEL_ID,
      messages: [{ role: 'user' as const, content: PRIVATE_PROMPT }],
    };

    await expect(collectStream(createOllamaProvider(ollamaUpstream).streamComplete(request))).resolves.toEqual(
      await collectStream(createOpenAiProvider(openAiUpstream).streamComplete(request)),
    );
  });

  it('normalizes model listing responses to compatible internal shapes', async () => {
    const ollama = await createOllamaProvider(ollamaUpstream).listModels();
    const openAi = await createOpenAiProvider(openAiUpstream).listModels();

    expect(ollama).toEqual(openAi);
    expect(ollama).toEqual([
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

  it('normalizes embedding responses to compatible internal vector shapes', async () => {
    const request = {
      model: TEST_MODEL_ID,
      input: [PRIVATE_PROMPT, 'Second private prompt'],
    };

    const ollama = await createOllamaProvider(ollamaUpstream).embed(request);
    const openAi = await createOpenAiProvider(openAiUpstream).embed(request);

    const comparableOllama = {
      model: ollama.model,
      embeddings: ollama.embeddings,
      usage: ollama.usage,
    };
    const comparableOpenAi = {
      model: openAi.model,
      embeddings: openAi.embeddings,
      usage: openAi.usage,
    };

    expect(comparableOllama).toEqual(comparableOpenAi);
    expect(redactLatency(ollama)).toEqual({
      providerId: 'ollama-parity',
      providerName: 'Ollama Parity',
      providerType: 'ollama',
      model: TEST_MODEL_ID,
      embeddings: [
        { embedding: [0.1, 0.2], index: 0 },
        { embedding: [0.3, 0.4], index: 1 },
      ],
      usage: { promptTokens: 6, totalTokens: 6 },
    });
  });

  it('normalizes HTTP errors with stable provider error metadata', async () => {
    const ollamaErrorUpstream = await createMockLlmUpstream(createOllamaErrorRoutes());
    const openAiErrorUpstream = await createMockLlmUpstream(createOpenAiErrorRoutes());

    try {
      await expect(createOllamaProvider(ollamaErrorUpstream).complete({
        model: TEST_MODEL_ID,
        messages: [{ role: 'user', content: PRIVATE_PROMPT }],
      })).rejects.toMatchObject({
        providerId: 'ollama-parity',
        code: 'HTTP_503',
        statusCode: 503,
      });
      await expect(createOpenAiProvider(openAiErrorUpstream).complete({
        model: TEST_MODEL_ID,
        messages: [{ role: 'user', content: PRIVATE_PROMPT }],
      })).rejects.toMatchObject({
        providerId: 'openai-parity',
        code: 'HTTP_503',
        statusCode: 503,
      });
    } finally {
      await Promise.all([
        ollamaErrorUpstream.close(),
        openAiErrorUpstream.close(),
      ]);
    }
  });

  it('emits partial streaming output before normalized stream failure', async () => {
    const partialOllamaUpstream = await createMockLlmUpstream(createOllamaPartialStreamFailureRoutes());
    const partialOpenAiUpstream = await createMockLlmUpstream(createOpenAiPartialStreamFailureRoutes());
    const ollamaProvider = createOllamaProvider(partialOllamaUpstream);
    const openAiProvider = createOpenAiProvider(partialOpenAiUpstream);
    const request = {
      model: TEST_MODEL_ID,
      messages: [{ role: 'user' as const, content: PRIVATE_PROMPT }],
    };

    try {
      const ollamaIterator = ollamaProvider.streamComplete(request)[Symbol.asyncIterator]();
      const openAiIterator = openAiProvider.streamComplete(request)[Symbol.asyncIterator]();

      await expect(ollamaIterator.next()).resolves.toEqual({
        done: false,
        value: { content: 'partial', reasoning: undefined, done: false, finishReason: undefined, usage: undefined },
      });
      await expect(openAiIterator.next()).resolves.toEqual({
        done: false,
        value: { content: 'partial', reasoning: undefined, done: false, finishReason: undefined, usage: undefined },
      });
      const ollamaFailure = ollamaIterator.next();
      const openAiFailure = openAiIterator.next();

      await expect(ollamaFailure).rejects.toMatchObject({
        providerId: 'ollama-parity',
        code: 'UPSTREAM_STREAM_ERROR',
      });
      await expect(openAiFailure).rejects.toMatchObject({
        providerId: 'openai-parity',
        code: 'UPSTREAM_STREAM_ERROR',
      });
      await expect(ollamaFailure).rejects.toBeInstanceOf(LlmStreamingError);
      await expect(openAiFailure).rejects.toBeInstanceOf(LlmStreamingError);
    } finally {
      await Promise.all([
        partialOllamaUpstream.close(),
        partialOpenAiUpstream.close(),
      ]);
    }
  });

  it('keeps secrets and private payloads out of provider results and logs', async () => {
    const ollamaProvider = createOllamaProvider(ollamaUpstream);
    const openAiProvider = createOpenAiProvider(openAiUpstream);

    const ollamaCompletion = await ollamaProvider.complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: PRIVATE_PROMPT }],
    });
    const openAiCompletion = await openAiProvider.complete({
      model: TEST_MODEL_ID,
      messages: [{ role: 'user', content: PRIVATE_PROMPT }],
    });
    const ollamaEmbedding = await ollamaProvider.embed({
      model: TEST_MODEL_ID,
      input: PRIVATE_PROMPT,
    });
    const openAiEmbedding = await openAiProvider.embed({
      model: TEST_MODEL_ID,
      input: PRIVATE_PROMPT,
    });

    const resultText = JSON.stringify([
      ollamaCompletion,
      openAiCompletion,
      ollamaEmbedding,
      openAiEmbedding,
    ]);
    expect(resultText).not.toContain(SECRET_TOKEN);
    expect(resultText).not.toContain(SECRET_HEADER);
    expect(resultText).not.toContain(PRIVATE_PROMPT);

    const logText = loggedPayloadText();
    expect(logText).not.toContain(SECRET_TOKEN);
    expect(logText).not.toContain(SECRET_HEADER);
    expect(logText).not.toContain(PRIVATE_PROMPT);
    expect(logText).not.toContain(PRIVATE_ANSWER);
    expect(logText).not.toContain(PRIVATE_REASONING);
    expect(logText).not.toContain('[0.1,0.2]');
  });
});
