import { ServerResponse } from 'node:http';
import { ChatSessionTitleSource, MessageAuthor, Prisma, UserRole, WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { logger } from '../../../config/logger';
import { NotFoundError } from '../../../errors';
import { ChatService } from '../../../modules/chat/chat.service';
import { ChatRepository } from '../../../modules/chat/chat.repository';
import { IChatWorkspaceContext } from '../../../modules/chat/chat.types';
import { GenerationUsageOutcome, GenerationUsageTokenCountSource } from '../../../modules/generationUsage';
import { WorkspaceService } from '../../../modules/workspace/workspace.service';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import {
  createIntegrationChatMessage,
  createIntegrationChatSession,
  createIntegrationTestUser,
  integrationPrisma,
  resetIntegrationDatabase,
} from '../helpers/prisma';
import {
  createMockLlmUpstream,
  MockRouteMap,
  MockLlmUpstream,
  sendChunksThenDestroy,
  sendJson,
} from '../helpers/mockLlmUpstream';

const MODEL_ID = 'integration-chat-model';
const UPSTREAM_MODEL = 'private-upstream-model-alias';
const UPSTREAM_ERROR_BODY = 'Bearer private-upstream-error-body';
const SECRET_API_KEY = 'chat-secret-api-key';
const SECRET_HEADER_VALUE = 'chat-secret-header-value';
const USER_PROMPT = 'Private integration prompt';
const PRIOR_PROMPT = 'Private prior prompt';
const ASSISTANT_CONTENT = 'Persisted integration answer';
const ASSISTANT_REASONING = 'Persisted integration reasoning';
const STREAM_CONTENT = 'Streamed integration answer';
const STREAM_REASONING = 'Streamed integration reasoning';
const PARTIAL_CONTENT = 'Partial integration answer';

function createChatWorkspaceContext(input: {
  workspace: {
    id: number;
    name: string;
    ownerUserId: number;
    type: WorkspaceType;
    status: WorkspaceStatus;
  };
  actorUserId: number;
  actorRole?: UserRole;
}): IChatWorkspaceContext {
  return {
    workspace: input.workspace,
    actor: {
      userId: input.actorUserId,
      role: input.actorRole ?? UserRole.USER,
    },
  };
}

function createOpenAiChatRoutes() {
  return {
    'POST /chat/completions': (request: { body: string }, res: ServerResponse) => {
      const body = JSON.parse(request.body) as { stream?: boolean };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: `${STREAM_REASONING} ` } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Streamed ' } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'integration answer' } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 9, completion_tokens: 10, total_tokens: 19 },
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      sendJson(res, 200, {
        model: UPSTREAM_MODEL,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: ASSISTANT_CONTENT,
              reasoning_content: ASSISTANT_REASONING,
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
      });
    },
  };
}

function createPartialStreamFailureRoutes() {
  return {
    'POST /chat/completions': (_request: unknown, res: ServerResponse) => {
      sendChunksThenDestroy(
        res,
        'text/event-stream',
        [`data: ${JSON.stringify({ choices: [{ delta: { content: PARTIAL_CONTENT } }] })}\n\n`],
      );
    },
  };
}

function createOllamaChatRoutes(status = 200) {
  return {
    'POST /api/chat': (_request: unknown, res: ServerResponse) => {
      if (status !== 200) {
        sendJson(res, status, { error: UPSTREAM_ERROR_BODY });
        return;
      }
      sendJson(res, 200, {
        model: UPSTREAM_MODEL,
        message: { content: ASSISTANT_CONTENT, thinking: ASSISTANT_REASONING },
        done_reason: 'stop',
        prompt_eval_count: 5,
        eval_count: 7,
      });
    },
  };
}

async function createPersistedOpenAiProvider(upstream: MockLlmUpstream, generationDefaults?: Prisma.InputJsonObject) {
  return integrationPrisma.llmProviderConfig.create({
    data: {
      name: 'Integration OpenAI Compatible',
      type: 'OPENAI_COMPATIBLE',
      baseUrl: upstream.baseUrl,
      enabled: true,
      defaultModel: MODEL_ID,
      timeoutMs: 5000,
      generationDefaults: generationDefaults ?? {},
      extraHeaders: { 'X-Chat-Secret': SECRET_HEADER_VALUE },
      apiKey: SECRET_API_KEY,
    },
  });
}

async function createPersistedOllamaProvider(upstream: MockLlmUpstream) {
  return integrationPrisma.llmProviderConfig.create({
    data: {
      name: 'Integration Ollama',
      type: 'OLLAMA',
      baseUrl: upstream.baseUrl,
      enabled: true,
      defaultModel: MODEL_ID,
      timeoutMs: 5000,
      generationDefaults: {},
      extraHeaders: { 'X-Chat-Secret': SECRET_HEADER_VALUE },
      apiKey: SECRET_API_KEY,
    },
  });
}

function loggedEvents(operation: string) {
  return [...jest.mocked(logger.info).mock.calls, ...jest.mocked(logger.error).mock.calls]
    .map(([payload]) => payload as Record<string, unknown>)
    .filter((payload) => payload.operation === operation);
}

function expectPairedEvents(chatOperation: string, providerOperation: string, requestId: string) {
  const chat = loggedEvents(chatOperation);
  const adapter = loggedEvents(providerOperation);
  expect(chat.map((event) => event.status)).toEqual(['started', 'success']);
  expect(adapter.map((event) => event.status)).toEqual(['started', 'success']);
  expect(chat[0]).toMatchObject({ layer: 'chat', requestId, model: MODEL_ID, operationId: expect.any(String) });
  expect(chat[1].operationId).toBe(chat[0].operationId);
  for (const event of adapter) {
    expect(event).toMatchObject({ layer: 'provider', requestId, model: MODEL_ID, operationId: chat[0].operationId });
  }
}

function loggedPayloadText(): string {
  return JSON.stringify([
    ...jest.mocked(logger.info).mock.calls.map(([payload]) => payload),
    ...jest.mocked(logger.error).mock.calls.map(([payload]) => payload),
  ]);
}

function expectNoSecrets(value: unknown): void {
  const text = JSON.stringify(value);
  expect(text).not.toContain(SECRET_API_KEY);
  expect(text).not.toContain(SECRET_HEADER_VALUE);
}

async function getSessionMessages(sessionId: number) {
  return integrationPrisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { id: 'asc' },
  });
}

async function getGenerationUsageRows() {
  return integrationPrisma.$queryRaw<Array<{
    id: number;
    workspaceId: number;
    providerId: number;
    model: string;
    streaming: boolean;
    latencyMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    tokenCountSource: string;
    outcome: string;
    errorCode: string | null;
    createdAt: Date;
  }>>`SELECT * FROM "generation_usages" ORDER BY "id" ASC`;
}

async function closeUpstream(upstream: MockLlmUpstream): Promise<void> {
  await upstream.close();
}

beforeEach(async () => {
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  await resetIntegrationDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Chat generation PostgreSQL integration', () => {
  it('advances concurrent placeholder replies monotonically and preserves a later manual title', async () => {
    const owner = await createIntegrationTestUser({ email: 'chat-eligibility-concurrent@example.com' });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const session = await createIntegrationChatSession(owner.id, {
      workspace: { connect: { id: workspace.id } },
      title: 'New Chat',
      titleSource: ChatSessionTitleSource.PLACEHOLDER,
    });
    const firstPrompt = await createIntegrationChatMessage(session.id, { content: 'First prompt' });
    const secondPrompt = await createIntegrationChatMessage(session.id, { content: 'Second prompt' });
    expect(session.latestEligibleAssistantMessageId).toBeNull();

    const [first, second] = await Promise.all([
      ChatRepository.createGeneratedAssistantMessage({
        sessionId: session.id, workspaceId: workspace.id, triggeringUserMessageId: firstPrompt.id,
        content: 'First reply', metadata: { finishReason: 'stop' }, titleEligible: true,
      }),
      ChatRepository.createGeneratedAssistantMessage({
        sessionId: session.id, workspaceId: workspace.id, triggeringUserMessageId: secondPrompt.id,
        content: 'Second reply', metadata: { finishReason: 'stop' }, titleEligible: true,
      }),
    ]);
    const eligibleId = Math.max(first.id, second.id);
    expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } }))
      .latestEligibleAssistantMessageId).toBe(eligibleId);
    const messages = await getSessionMessages(session.id);
    expect(messages.find((message) => message.id === first.id)?.triggeringUserMessageId).toBe(firstPrompt.id);
    expect(messages.find((message) => message.id === second.id)?.triggeringUserMessageId).toBe(secondPrompt.id);

    await ChatRepository.updateSessionInWorkspace(session.id, workspace.id, { title: 'My title' });
    const thirdPrompt = await createIntegrationChatMessage(session.id, { content: 'Third prompt' });
    await ChatRepository.createGeneratedAssistantMessage({
      sessionId: session.id, workspaceId: workspace.id, triggeringUserMessageId: thirdPrompt.id,
      content: 'Third reply', metadata: { finishReason: 'stop' }, titleEligible: true,
    });
    expect(await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } }))
      .toMatchObject({
        title: 'My title',
        titleSource: ChatSessionTitleSource.USER,
        latestEligibleAssistantMessageId: eligibleId,
      });
  });

  it('persists non-streaming user and assistant messages with provider metadata', async () => {
    const upstream = await createMockLlmUpstream(createOpenAiChatRoutes());

    try {
      const owner = await createIntegrationTestUser({ email: 'chat-generation-owner@example.com' });
      const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
      const provider = await createPersistedOpenAiProvider(upstream, {
        temperature: 0.4,
        topP: 0.9,
        maxTokens: 256,
        stopSequences: ['END'],
      });
      const session = await createIntegrationChatSession(owner.id, {
        workspace: { connect: { id: workspace.id } },
        title: 'New Chat',
        titleSource: ChatSessionTitleSource.PLACEHOLDER,
      });
      await createIntegrationChatMessage(session.id, {
        content: PRIOR_PROMPT,
        author: MessageAuthor.USER,
      });

      const result = await ChatService.generateAssistantResponse({
        sessionId: session.id,
        content: USER_PROMPT,
        providerId: provider.id,
        temperature: 0.2,
        requestId: 'req-integration-complete',
      }, createChatWorkspaceContext({ workspace, actorUserId: owner.id }));

      expect(result.userMessage).toMatchObject({
        content: USER_PROMPT,
        author: MessageAuthor.USER,
        sessionId: session.id,
      });
      expect(result.assistantMessage).toMatchObject({
        content: ASSISTANT_CONTENT,
        author: MessageAuthor.ASSISTANT,
        sessionId: session.id,
        metadata: expect.objectContaining({
          providerId: String(provider.id),
          providerName: provider.name,
          providerType: 'openai-compatible',
          model: MODEL_ID,
          reasoning: ASSISTANT_REASONING,
          finishReason: 'stop',
          usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 },
          latencyMs: expect.any(Number),
          params: {
            temperature: 0.2,
            topP: 0.9,
            maxTokens: 256,
            stopSequences: ['END'],
          },
        }),
      });

      const messages = await getSessionMessages(session.id);
      expect(messages).toHaveLength(3);
      expect(messages.map((message) => [message.author, message.content])).toEqual([
        [MessageAuthor.USER, PRIOR_PROMPT],
        [MessageAuthor.USER, USER_PROMPT],
        [MessageAuthor.ASSISTANT, ASSISTANT_CONTENT],
      ]);
      expect(messages[2].metadata).toEqual(expect.objectContaining({
        providerId: String(provider.id),
        reasoning: ASSISTANT_REASONING,
        finishReason: 'stop',
      }));
      expect(messages[2].triggeringUserMessageId).toBe(result.userMessage.id);
      const titleSession = await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(titleSession.latestEligibleAssistantMessageId).toBe(result.assistantMessage.id);
      expect(titleSession.latestAttemptedAssistantMessageId).toBeNull();
      expect(await integrationPrisma.job.count({ where: { type: 'chat.session_title' } })).toBe(0);
      const usageRows = await getGenerationUsageRows();
      expect(usageRows).toHaveLength(1);
      expect(usageRows[0]).toMatchObject({
        workspaceId: workspace.id,
        providerId: provider.id,
        model: MODEL_ID,
        streaming: false,
        inputTokens: 5,
        outputTokens: 7,
        totalTokens: 12,
        tokenCountSource: GenerationUsageTokenCountSource.PROVIDER_REPORTED,
        outcome: GenerationUsageOutcome.SUCCEEDED,
        errorCode: null,
      });

      expect(upstream.requests).toHaveLength(1);
      expect(upstream.requests[0].headers).toMatchObject({
        authorization: `Bearer ${SECRET_API_KEY}`,
        'x-chat-secret': SECRET_HEADER_VALUE,
      });
      expect(JSON.parse(upstream.requests[0].body)).toMatchObject({
        model: MODEL_ID,
        messages: [
          { role: 'user', content: PRIOR_PROMPT },
          { role: 'user', content: USER_PROMPT },
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 256,
        stop: ['END'],
        stream: false,
      });
      expectNoSecrets(result);
      expectNoSecrets(messages[2].metadata);
      expectNoSecrets(usageRows);
      expect(JSON.stringify(usageRows)).not.toContain(USER_PROMPT);
      expect(JSON.stringify(usageRows)).not.toContain(PRIOR_PROMPT);
      expect(JSON.stringify(usageRows)).not.toContain(ASSISTANT_CONTENT);
      expect(JSON.stringify(usageRows)).not.toContain(ASSISTANT_REASONING);
      expect(JSON.stringify(usageRows)).not.toContain('END');
      expectPairedEvents('chat.complete', 'provider.complete', 'req-integration-complete');
      expect(loggedEvents('provider.complete')[1]).toMatchObject({ providerModelMismatch: true });
      expect(loggedPayloadText()).not.toContain(UPSTREAM_MODEL);
      expect(loggedPayloadText()).not.toContain(SECRET_API_KEY);
      expect(loggedPayloadText()).not.toContain(SECRET_HEADER_VALUE);
      expect(loggedPayloadText()).not.toContain(USER_PROMPT);
      expect(loggedPayloadText()).not.toContain(ASSISTANT_CONTENT);
      expect(loggedPayloadText()).not.toContain(ASSISTANT_REASONING);
    } finally {
      await closeUpstream(upstream);
    }
  });

  it('correlates Ollama chat, adapter, and selected-model usage without logging upstream content', async () => {
    const upstream = await createMockLlmUpstream(createOllamaChatRoutes());
    try {
      const owner = await createIntegrationTestUser({ email: 'chat-ollama-observability@example.com' });
      const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
      const provider = await createPersistedOllamaProvider(upstream);
      const session = await createIntegrationChatSession(owner.id, {
        workspace: { connect: { id: workspace.id } },
      });
      const result = await ChatService.generateAssistantResponse({
        sessionId: session.id, content: USER_PROMPT, providerId: provider.id,
        requestId: 'req-ollama-complete',
      }, createChatWorkspaceContext({ workspace, actorUserId: owner.id }));

      expect(result.assistantMessage).toMatchObject({
        content: ASSISTANT_CONTENT,
        metadata: expect.objectContaining({ model: MODEL_ID, reasoning: ASSISTANT_REASONING }),
      });
      expect(await getGenerationUsageRows()).toEqual([
        expect.objectContaining({ model: MODEL_ID, outcome: GenerationUsageOutcome.SUCCEEDED }),
      ]);
      expectPairedEvents('chat.complete', 'provider.complete', 'req-ollama-complete');
      expect(loggedPayloadText()).not.toContain(UPSTREAM_MODEL);
      expect(loggedPayloadText()).not.toContain(USER_PROMPT);
      expect(loggedPayloadText()).not.toContain(ASSISTANT_CONTENT);
      expect(loggedPayloadText()).not.toContain(ASSISTANT_REASONING);
      expectNoSecrets(loggedPayloadText());
    } finally {
      await closeUpstream(upstream);
    }
  });

  it.each(['ollama', 'openai-compatible'] as const)(
    'keeps %s upstream HTTP failure bodies out of correlated logs and usage', async (providerType) => {
      const upstream = await createMockLlmUpstream(providerType === 'ollama'
        ? createOllamaChatRoutes(503)
        : { 'POST /chat/completions': (_request: unknown, res: ServerResponse) => {
          sendJson(res, 503, { error: { message: UPSTREAM_ERROR_BODY } });
        } });
      try {
        const owner = await createIntegrationTestUser({ email: `chat-${providerType}-failure@example.com` });
        const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
        const provider = providerType === 'ollama'
          ? await createPersistedOllamaProvider(upstream)
          : await createPersistedOpenAiProvider(upstream);
        const session = await createIntegrationChatSession(owner.id, {
          workspace: { connect: { id: workspace.id } },
        });
        const requestId = `req-${providerType}-failure`;

        await expect(ChatService.generateAssistantResponse({
          sessionId: session.id, content: USER_PROMPT, providerId: provider.id, requestId,
        }, createChatWorkspaceContext({ workspace, actorUserId: owner.id })))
          .rejects.toMatchObject({ code: 'HTTP_503', statusCode: 503 });

        expect(await getGenerationUsageRows()).toEqual([
          expect.objectContaining({ model: MODEL_ID, outcome: GenerationUsageOutcome.FAILED, errorCode: 'HTTP_503' }),
        ]);
        const chat = loggedEvents('chat.complete');
        const adapter = loggedEvents('provider.complete');
        expect(chat.map((event) => event.status)).toEqual(['started', 'error']);
        expect(adapter.map((event) => event.status)).toEqual(['started', 'error']);
        expect(adapter[1]).toMatchObject({
          layer: 'provider', operationId: chat[0].operationId, requestId,
          providerId: String(provider.id), failureCategory: 'http',
          errorCode: 'HTTP_503', upstreamStatus: 503, latencyMs: expect.any(Number),
        });
        expect(loggedPayloadText()).not.toContain(UPSTREAM_ERROR_BODY);
        expect(loggedPayloadText()).not.toContain(USER_PROMPT);
        expectNoSecrets(loggedPayloadText());
      } finally {
        await closeUpstream(upstream);
      }
    },
  );

  it('persists successful streaming output with accumulated metadata', async () => {
    const upstream = await createMockLlmUpstream(createOpenAiChatRoutes());

    try {
      const owner = await createIntegrationTestUser({ email: 'chat-stream-owner@example.com' });
      const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
      const provider = await createPersistedOpenAiProvider(upstream);
      const session = await createIntegrationChatSession(owner.id, {
        workspace: { connect: { id: workspace.id } },
        title: 'New Chat',
        titleSource: ChatSessionTitleSource.PLACEHOLDER,
      });
      const events = [];

      for await (const event of ChatService.streamAssistantResponse({
        sessionId: session.id,
        content: USER_PROMPT,
        providerId: provider.id,
        requestId: 'req-integration-stream',
      }, createChatWorkspaceContext({ workspace, actorUserId: owner.id }))) {
        events.push(event);
      }

      expect(events).toEqual([
        { event: 'user_message', data: expect.objectContaining({ content: USER_PROMPT }) },
        { event: 'delta', data: { reasoning: `${STREAM_REASONING} ` } },
        { event: 'delta', data: { content: 'Streamed ' } },
        { event: 'delta', data: { content: 'integration answer' } },
        { event: 'assistant_message', data: expect.objectContaining({ content: STREAM_CONTENT }) },
        { event: 'done', data: { done: true } },
      ]);

      const messages = await getSessionMessages(session.id);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        content: USER_PROMPT,
        author: MessageAuthor.USER,
        sessionId: session.id,
      });
      expect(messages[1]).toMatchObject({
        content: STREAM_CONTENT,
        author: MessageAuthor.ASSISTANT,
        sessionId: session.id,
        metadata: expect.objectContaining({
          providerId: String(provider.id),
          providerName: provider.name,
          providerType: 'openai-compatible',
          model: MODEL_ID,
          reasoning: `${STREAM_REASONING} `,
          finishReason: 'stop',
          usage: { promptTokens: 9, completionTokens: 10, totalTokens: 19 },
          latencyMs: expect.any(Number),
          params: {},
        }),
      });
      expect(messages[1].triggeringUserMessageId).toBe(messages[0].id);
      expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } }))
        .latestEligibleAssistantMessageId).toBe(messages[1].id);
      expect(await integrationPrisma.job.count({ where: { type: 'chat.session_title' } })).toBe(0);
      const usageRows = await getGenerationUsageRows();
      expect(usageRows).toHaveLength(1);
      expect(usageRows[0]).toMatchObject({
        workspaceId: workspace.id,
        providerId: provider.id,
        model: MODEL_ID,
        streaming: true,
        inputTokens: 9,
        outputTokens: 10,
        totalTokens: 19,
        tokenCountSource: GenerationUsageTokenCountSource.PROVIDER_REPORTED,
        outcome: GenerationUsageOutcome.SUCCEEDED,
        errorCode: null,
      });
      expect(upstream.requests).toHaveLength(1);
      expect(JSON.parse(upstream.requests[0].body)).toMatchObject({
        model: MODEL_ID,
        messages: [{ role: 'user', content: USER_PROMPT }],
        stream: true,
      });
      expectNoSecrets(messages[1].metadata);
      expectNoSecrets(usageRows);
      expect(JSON.stringify(usageRows)).not.toContain(USER_PROMPT);
      expect(JSON.stringify(usageRows)).not.toContain(STREAM_CONTENT);
      expect(JSON.stringify(usageRows)).not.toContain(STREAM_REASONING);
      expectPairedEvents('chat.stream', 'provider.stream', 'req-integration-stream');
      expect(loggedPayloadText()).not.toContain(SECRET_API_KEY);
      expect(loggedPayloadText()).not.toContain(SECRET_HEADER_VALUE);
      expect(loggedPayloadText()).not.toContain(USER_PROMPT);
      expect(loggedPayloadText()).not.toContain(STREAM_CONTENT);
      expect(loggedPayloadText()).not.toContain(STREAM_REASONING);
    } finally {
      await closeUpstream(upstream);
    }
  });

  it('accepts an OpenAI-compatible [DONE] frame without a finish reason', async () => {
    const upstream = await createMockLlmUpstream({
      'POST /chat/completions': (_request, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: STREAM_CONTENT } }] })}\n\ndata: [DONE]\n\n`);
      },
    });
    try {
      const owner = await createIntegrationTestUser({ email: 'chat-stream-done-only@example.com' });
      const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
      const provider = await createPersistedOpenAiProvider(upstream);
      const session = await createIntegrationChatSession(owner.id, {
        workspace: { connect: { id: workspace.id } },
        title: 'New Chat', titleSource: ChatSessionTitleSource.PLACEHOLDER,
      });
      const events = [];
      for await (const event of ChatService.streamAssistantResponse({
        sessionId: session.id, content: USER_PROMPT, providerId: provider.id,
      }, createChatWorkspaceContext({ workspace, actorUserId: owner.id }))) events.push(event.event);

      expect(events).toEqual(['user_message', 'delta', 'assistant_message', 'done']);
      const messages = await getSessionMessages(session.id);
      expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } }))
        .latestEligibleAssistantMessageId).toBe(messages[1].id);
      expect(messages[1].triggeringUserMessageId).toBe(messages[0].id);
    } finally {
      await closeUpstream(upstream);
    }
  });

  it.each(['ollama', 'openai-compatible'] as const)(
    'treats clean %s EOF after output as a failed, ineligible partial reply', async (providerType) => {
      const routes: MockRouteMap = providerType === 'ollama'
        ? { 'POST /api/chat': (_request: unknown, res: ServerResponse) => {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          res.end(`${JSON.stringify({ message: { content: PARTIAL_CONTENT }, done: false })}\n`);
        } }
        : { 'POST /chat/completions': (_request: unknown, res: ServerResponse) => {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: PARTIAL_CONTENT } }] })}\n\n`);
        } };
      const upstream = await createMockLlmUpstream(routes);
      try {
        const owner = await createIntegrationTestUser({ email: `chat-${providerType}-early-eof@example.com` });
        const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
        const provider = providerType === 'ollama'
          ? await createPersistedOllamaProvider(upstream) : await createPersistedOpenAiProvider(upstream);
        const session = await createIntegrationChatSession(owner.id, {
          workspace: { connect: { id: workspace.id } },
          title: 'New Chat', titleSource: ChatSessionTitleSource.PLACEHOLDER,
        });
        const events: string[] = [];

        await expect((async () => {
          for await (const event of ChatService.streamAssistantResponse({
            sessionId: session.id, content: USER_PROMPT, providerId: provider.id,
          }, createChatWorkspaceContext({ workspace, actorUserId: owner.id }))) events.push(event.event);
        })()).rejects.toMatchObject({ code: 'UPSTREAM_STREAM_ERROR' });

        expect(events).toEqual(['user_message', 'delta', 'assistant_message']);
        const messages = await getSessionMessages(session.id);
        expect(messages).toHaveLength(2);
        expect(messages[1]).toMatchObject({
          content: PARTIAL_CONTENT,
          triggeringUserMessageId: messages[0].id,
          metadata: expect.objectContaining({ finishReason: 'error', incomplete: true }),
        });
        expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } }))
          .latestEligibleAssistantMessageId).toBeNull();
        expect(await getGenerationUsageRows()).toEqual([
          expect.objectContaining({ outcome: GenerationUsageOutcome.FAILED, errorCode: 'UPSTREAM_STREAM_ERROR' }),
        ]);
        expect(loggedEvents('provider.stream').map((event) => event.status)).toEqual(['started', 'error']);
        expect(loggedEvents('chat.stream').map((event) => event.status)).toEqual(['started', 'error']);
      } finally {
        await closeUpstream(upstream);
      }
    },
  );

  it('correlates an early stream close and records only selected-model abort usage', async () => {
    const upstream = await createMockLlmUpstream(createOpenAiChatRoutes());
    try {
      const owner = await createIntegrationTestUser({ email: 'chat-stream-abort-observability@example.com' });
      const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
      const provider = await createPersistedOpenAiProvider(upstream);
      const session = await createIntegrationChatSession(owner.id, {
        workspace: { connect: { id: workspace.id } },
      });
      const iterator = ChatService.streamAssistantResponse({
        sessionId: session.id, content: USER_PROMPT, providerId: provider.id,
        requestId: 'req-integration-abort',
      }, createChatWorkspaceContext({ workspace, actorUserId: owner.id }))[Symbol.asyncIterator]();

      await expect(iterator.next()).resolves.toMatchObject({ value: { event: 'user_message' } });
      await expect(iterator.next()).resolves.toMatchObject({ value: { event: 'delta' } });
      await iterator.return?.();

      expect(await getGenerationUsageRows()).toEqual([
        expect.objectContaining({ model: MODEL_ID, outcome: GenerationUsageOutcome.ABORTED }),
      ]);
      const chat = loggedEvents('chat.stream');
      const adapter = loggedEvents('provider.stream');
      expect(chat.map((event) => event.status)).toEqual(['started', 'aborted']);
      expect(adapter.map((event) => event.status)).toEqual(['started', 'aborted']);
      expect(adapter[1]).toMatchObject({
        operationId: chat[0].operationId, requestId: 'req-integration-abort',
        stage: 'local_abort', latencyMs: expect.any(Number),
      });
      expect(loggedPayloadText()).not.toContain(USER_PROMPT);
      expect(loggedPayloadText()).not.toContain(STREAM_REASONING);
      expectNoSecrets(loggedPayloadText());
    } finally {
      await closeUpstream(upstream);
    }
  });

  it('persists partial assistant output when streaming fails after deltas', async () => {
    const upstream = await createMockLlmUpstream(createPartialStreamFailureRoutes());

    try {
      const owner = await createIntegrationTestUser({ email: 'chat-partial-stream-owner@example.com' });
      const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
      const provider = await createPersistedOpenAiProvider(upstream);
      const session = await createIntegrationChatSession(owner.id, {
        workspace: { connect: { id: workspace.id } },
        title: 'New Chat',
        titleSource: ChatSessionTitleSource.PLACEHOLDER,
      });
      const events = [];
      let caughtError: unknown;

      try {
        for await (const event of ChatService.streamAssistantResponse({
          sessionId: session.id,
          content: USER_PROMPT,
          providerId: provider.id,
          requestId: 'req-integration-partial-stream',
        }, createChatWorkspaceContext({ workspace, actorUserId: owner.id }))) {
          events.push(event);
        }
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toMatchObject({
        providerId: String(provider.id),
        code: 'UPSTREAM_STREAM_ERROR',
      });
      expect(events).toEqual([
        { event: 'user_message', data: expect.objectContaining({ content: USER_PROMPT }) },
        { event: 'delta', data: { content: PARTIAL_CONTENT } },
        { event: 'assistant_message', data: expect.objectContaining({ content: PARTIAL_CONTENT }) },
      ]);

      const messages = await getSessionMessages(session.id);
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({
        content: PARTIAL_CONTENT,
        author: MessageAuthor.ASSISTANT,
        sessionId: session.id,
        metadata: expect.objectContaining({
          providerId: String(provider.id),
          providerType: 'openai-compatible',
          model: MODEL_ID,
          finishReason: 'error',
          incomplete: true,
          errorMessage: expect.any(String),
        }),
      });
      expect(messages[1].triggeringUserMessageId).toBe(messages[0].id);
      expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } }))
        .latestEligibleAssistantMessageId).toBeNull();
      const usageRows = await getGenerationUsageRows();
      expect(usageRows).toHaveLength(1);
      expect(usageRows[0]).toMatchObject({
        workspaceId: workspace.id,
        providerId: provider.id,
        model: MODEL_ID,
        streaming: true,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        tokenCountSource: GenerationUsageTokenCountSource.UNKNOWN,
        outcome: GenerationUsageOutcome.FAILED,
        errorCode: 'UPSTREAM_STREAM_ERROR',
      });
      expect(upstream.requests).toHaveLength(1);
      expectNoSecrets(messages[1].metadata);
      expectNoSecrets(usageRows);
      expect(JSON.stringify(usageRows)).not.toContain(USER_PROMPT);
      expect(JSON.stringify(usageRows)).not.toContain(PARTIAL_CONTENT);
      const chatFailure = loggedEvents('chat.stream');
      const adapterFailure = loggedEvents('provider.stream');
      expect(chatFailure.map((event) => event.status)).toEqual(['started', 'error']);
      expect(adapterFailure.map((event) => event.status)).toEqual(['started', 'error']);
      expect(adapterFailure[1]).toMatchObject({
        operationId: chatFailure[0].operationId,
        requestId: 'req-integration-partial-stream',
        failureCategory: 'stream',
        errorCode: 'UPSTREAM_STREAM_ERROR',
        latencyMs: expect.any(Number),
      });
      expect(loggedPayloadText()).not.toContain(SECRET_API_KEY);
      expect(loggedPayloadText()).not.toContain(SECRET_HEADER_VALUE);
      expect(loggedPayloadText()).not.toContain(USER_PROMPT);
      expect(loggedPayloadText()).not.toContain(PARTIAL_CONTENT);
    } finally {
      await closeUpstream(upstream);
    }
  });

  it('rejects cross-workspace generation before writing messages or opening upstream', async () => {
    const upstream = await createMockLlmUpstream(createOpenAiChatRoutes());

    try {
      const owner = await createIntegrationTestUser({ email: 'chat-cross-workspace-owner@example.com' });
      const { workspace: personalWorkspace } =
        await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
      const standardWorkspace = await WorkspaceService.createStandardWorkspace({
        ownerUserId: owner.id,
        name: 'Generation Project Workspace',
      });
      const provider = await createPersistedOpenAiProvider(upstream);
      const standardSession = await createIntegrationChatSession(owner.id, {
        workspace: { connect: { id: standardWorkspace.id } },
      });

      await expect(ChatService.generateAssistantResponse({
        sessionId: standardSession.id,
        content: USER_PROMPT,
        providerId: provider.id,
      }, createChatWorkspaceContext({
        workspace: personalWorkspace,
        actorUserId: owner.id,
      }))).rejects.toThrow(new NotFoundError('Session not found'));

      await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
      await expect(
        integrationPrisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) AS count FROM "generation_usages"`,
      ).resolves.toEqual([{ count: 0n }]);
      expect(upstream.requests).toHaveLength(0);
    } finally {
      await closeUpstream(upstream);
    }
  });
});
