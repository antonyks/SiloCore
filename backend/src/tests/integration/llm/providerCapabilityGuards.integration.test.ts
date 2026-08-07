import { ServerResponse } from 'node:http';
import { Prisma } from '@prisma/client';
import { logger } from '../../../config/logger';
import { LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE } from '../../../modules/llm/llm.capabilities';
import { LlmRuntimeService } from '../../../modules/llm/llmRuntime.service';
import { resetIntegrationDatabase, integrationPrisma } from '../helpers/prisma';
import {
  createMockLlmUpstream,
  MockLlmUpstream,
  sendJson,
} from '../helpers/mockLlmUpstream';

const OPENAI_MODEL_ID = 'capability-openai-model';
const OLLAMA_MODEL_ID = 'capability-ollama-model';
const SECRET_API_KEY = 'capability-secret-api-key';
const EXTRA_HEADER_VALUE = 'capability-extra-header-value';
const PRIVATE_PROMPT = 'Private capability guard prompt';
const PRIVATE_ANSWER = 'Private capability guard answer';
const PRIVATE_REASONING = 'Private capability guard reasoning';

type ProviderType = 'OLLAMA' | 'OPENAI_COMPATIBLE';

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
        model: OPENAI_MODEL_ID,
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
      sendJson(res, 200, { object: 'list', data: [{ id: OPENAI_MODEL_ID, object: 'model' }] });
    },
    'POST /embeddings': (_request: unknown, res: ServerResponse) => {
      sendJson(res, 200, {
        object: 'list',
        model: OPENAI_MODEL_ID,
        data: [
          { object: 'embedding', index: 0, embedding: [0.1, 0.2] },
          { object: 'embedding', index: 1, embedding: [0.3, 0.4] },
        ],
        usage: { prompt_tokens: 6, total_tokens: 6 },
      });
    },
  };
}

function createOllamaRoutes() {
  return {
    'POST /api/pull': (_request: unknown, res: ServerResponse) => {
      sendJson(res, 200, { status: 'success' });
    },
  };
}

async function createPersistedProvider(params: {
  name: string;
  type: ProviderType;
  baseUrl: string;
  defaultModel: string;
  generationDefaults?: Prisma.InputJsonObject;
}) {
  return integrationPrisma.llmProviderConfig.create({
    data: {
      name: params.name,
      type: params.type,
      baseUrl: params.baseUrl,
      enabled: true,
      defaultModel: params.defaultModel,
      timeoutMs: 5000,
      generationDefaults: params.generationDefaults ?? {},
      extraHeaders: { 'X-Capability-Secret': EXTRA_HEADER_VALUE },
      apiKey: SECRET_API_KEY,
    },
  });
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

function expectNoPrivateOperationalPayload(value: unknown): void {
  const text = JSON.stringify(value);

  expect(text).not.toContain(SECRET_API_KEY);
  expect(text).not.toContain(EXTRA_HEADER_VALUE);
  expect(text).not.toContain(PRIVATE_PROMPT);
  expect(text).not.toContain(PRIVATE_ANSWER);
  expect(text).not.toContain(PRIVATE_REASONING);
}

describe('Provider capability guard integration', () => {
  let upstreams: MockLlmUpstream[];

  beforeEach(async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    upstreams = [];
    await resetIntegrationDatabase();
  });

  afterEach(async () => {
    await Promise.all(upstreams.map((upstream) => upstream.close()));
    jest.restoreAllMocks();
  });

  it('rejects unsupported OpenAI-compatible model pulling before upstream access', async () => {
    const openAiUpstream = await createMockLlmUpstream(createOpenAiRoutes());
    upstreams.push(openAiUpstream);

    const openAiProvider = await createPersistedProvider({
      name: 'Capability OpenAI Compatible',
      type: 'OPENAI_COMPATIBLE',
      baseUrl: openAiUpstream.baseUrl,
      defaultModel: OPENAI_MODEL_ID,
    });

    const result = await LlmRuntimeService.pullProviderModel(openAiProvider.id, OPENAI_MODEL_ID);

    expect(result).toEqual({
      providerId: String(openAiProvider.id),
      providerName: 'Capability OpenAI Compatible',
      providerType: 'openai-compatible',
      status: 'error',
      errorMessage: 'Provider type openai-compatible does not support model pulling.',
      errorCode: LLM_PROVIDER_CAPABILITY_UNSUPPORTED_CODE,
    });
    expect(openAiUpstream.requests).toHaveLength(0);
    expectNoPrivateOperationalPayload(result);
    expectNoPrivateOperationalPayload(loggedPayloadText());
  });

  it('reaches upstream mocks for supported OpenAI-compatible runtime operations', async () => {
    const openAiUpstream = await createMockLlmUpstream(createOpenAiRoutes());
    upstreams.push(openAiUpstream);

    const openAiProvider = await createPersistedProvider({
      name: 'Capability OpenAI Compatible',
      type: 'OPENAI_COMPATIBLE',
      baseUrl: openAiUpstream.baseUrl,
      defaultModel: OPENAI_MODEL_ID,
      generationDefaults: { temperature: 0.2 },
    });

    const completion = await LlmRuntimeService.resolveGenerationProvider({
      providerId: openAiProvider.id,
      model: OPENAI_MODEL_ID,
      operation: 'completion',
    });
    const completionResponse = await completion.provider.complete({
      model: completion.model,
      messages: [{ role: 'user', content: PRIVATE_PROMPT }],
    });

    expect(completionResponse.content).toBe(PRIVATE_ANSWER);
    expect(openAiUpstream.requests).toHaveLength(1);
    expect(openAiUpstream.requests[0]).toMatchObject({
      method: 'POST',
      path: '/chat/completions',
    });

    const streaming = await LlmRuntimeService.resolveGenerationProvider({
      providerId: openAiProvider.id,
      model: OPENAI_MODEL_ID,
      operation: 'streaming',
    });
    const streamChunks = await collectStream(streaming.provider.streamComplete({
      model: streaming.model,
      messages: [{ role: 'user', content: PRIVATE_PROMPT }],
    }));

    expect(streamChunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasoning: PRIVATE_REASONING }),
      expect.objectContaining({ content: PRIVATE_ANSWER }),
      expect.objectContaining({ done: true, finishReason: 'stop' }),
    ]));
    expect(openAiUpstream.requests).toHaveLength(2);
    expect(openAiUpstream.requests[1]).toMatchObject({
      method: 'POST',
      path: '/chat/completions',
    });

    const modelList = await LlmRuntimeService.listProviderModels(openAiProvider.id);

    expect(modelList.providers).toEqual([
      expect.objectContaining({
        providerId: String(openAiProvider.id),
        providerType: 'openai-compatible',
        status: 'success',
        modelCount: 1,
      }),
    ]);
    expect(modelList.models).toEqual([
      expect.objectContaining({
        providerId: String(openAiProvider.id),
        modelId: OPENAI_MODEL_ID,
      }),
    ]);
    expect(openAiUpstream.requests).toHaveLength(3);
    expect(openAiUpstream.requests[2]).toMatchObject({
      method: 'GET',
      path: '/models',
    });

    const embedding = await LlmRuntimeService.embedWithProvider({
      providerId: openAiProvider.id,
      request: {
        model: OPENAI_MODEL_ID,
        input: [PRIVATE_PROMPT, 'Second private prompt'],
      },
    });

    expect(embedding).toEqual(expect.objectContaining({
      providerId: String(openAiProvider.id),
      providerName: 'Capability OpenAI Compatible',
      providerType: 'openai-compatible',
      model: OPENAI_MODEL_ID,
      embeddings: [
        { embedding: [0.1, 0.2], index: 0 },
        { embedding: [0.3, 0.4], index: 1 },
      ],
      usage: { promptTokens: 6, totalTokens: 6 },
    }));
    expect(openAiUpstream.requests).toHaveLength(4);
    expect(openAiUpstream.requests[3]).toMatchObject({
      method: 'POST',
      path: '/embeddings',
    });

    expect(openAiUpstream.requests.map((request) => request.headers.authorization)).toEqual([
      `Bearer ${SECRET_API_KEY}`,
      `Bearer ${SECRET_API_KEY}`,
      `Bearer ${SECRET_API_KEY}`,
      `Bearer ${SECRET_API_KEY}`,
    ]);
    expectNoPrivateOperationalPayload(loggedPayloadText());
  });

  it('reaches upstream mocks for supported persisted Ollama model pulling', async () => {
    const ollamaUpstream = await createMockLlmUpstream(createOllamaRoutes());
    upstreams.push(ollamaUpstream);

    const ollamaProvider = await createPersistedProvider({
      name: 'Capability Ollama',
      type: 'OLLAMA',
      baseUrl: ollamaUpstream.baseUrl,
      defaultModel: OLLAMA_MODEL_ID,
    });

    const result = await LlmRuntimeService.pullProviderModel(ollamaProvider.id, OLLAMA_MODEL_ID);

    expect(result).toEqual({
      providerId: String(ollamaProvider.id),
      providerName: 'Capability Ollama',
      providerType: 'ollama',
      status: 'success',
    });
    expect(ollamaUpstream.requests).toHaveLength(1);
    expect(ollamaUpstream.requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/pull',
    });
    expect(ollamaUpstream.requests[0].headers.authorization).toBe(`Bearer ${SECRET_API_KEY}`);
    expectNoPrivateOperationalPayload(loggedPayloadText());
  });
});
