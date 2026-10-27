import type { JobWithMetadata } from 'pg-boss';
import { ChatSessionTitleSource, GenerationUsageOperation, GenerationUsageOutcome, JobStatus, LlmProviderConfigType, MessageAuthor } from '@prisma/client';
import { runJobWorker } from '../../../modules/job/job.worker';
import { JobQueuePayload } from '../../../modules/job/job.types';
import { LlmRuntimeService } from '../../../modules/llm/llmRuntime.service';
import { createSessionTitleJobHandler, SESSION_TITLE_JOB_TYPE } from '../../../modules/worker/sessionTitleJob';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';
import { createMockLlmUpstream, sendJson } from '../helpers/mockLlmUpstream';

beforeEach(resetIntegrationDatabase);

async function fixture(baseUrl: string, options: { timeoutMs?: number; model?: string; maxTokens?: number } = {}) {
  const owner = await createIntegrationTestUser();
  const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
  const provider = await integrationPrisma.llmProviderConfig.create({
    data: {
      name: 'Title provider', type: LlmProviderConfigType.OLLAMA,
      baseUrl, enabled: true, defaultModel: 'different-default',
      timeoutMs: options.timeoutMs ?? null,
      generationDefaults: options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
      apiKey: 'private-provider-secret',
    },
  });
  const session = await integrationPrisma.chatSession.create({
    data: { userId: owner.id, workspaceId: workspace.id, title: 'New Chat', titleSource: ChatSessionTitleSource.PLACEHOLDER },
  });
  const user = await integrationPrisma.chatMessage.create({
    data: { sessionId: session.id, author: MessageAuthor.USER, content: 'Private conversation about red maple trees' },
  });
  const assistant = await integrationPrisma.chatMessage.create({
    data: {
      sessionId: session.id, author: MessageAuthor.ASSISTANT,
      content: 'Red maples thrive in moist, acidic soil.', triggeringUserMessageId: user.id,
      metadata: { providerId: String(provider.id), model: options.model ?? 'actual-reply-model',
        finishReason: 'stop', reasoning: 'private chain of thought' },
    },
  });
  await integrationPrisma.chatSession.update({
    where: { id: session.id }, data: { latestEligibleAssistantMessageId: assistant.id },
  });
  const payload = { sessionId: session.id, assistantMessageId: assistant.id };
  const job = await integrationPrisma.job.create({
    data: { workspaceId: workspace.id, createdByUserId: owner.id, type: SESSION_TITLE_JOB_TYPE,
      payload, maxAttempts: 1 },
  });
  return { owner, workspace, provider, session, user, assistant, payload, job };
}

function run(job: Awaited<ReturnType<typeof fixture>>['job'], payload: unknown = job.payload, signal = new AbortController().signal) {
  return createSessionTitleJobHandler()({
    job, payload: payload as typeof job.payload, signal,
    heartbeat: async () => undefined,
    checkpointCancellation: async () => undefined,
  });
}

describe('session title job', () => {
  it('uses the actual reply model, applies a title, and stores only safe usage and result data', async () => {
    const upstream = await createMockLlmUpstream({
      'POST /api/chat': (_request, response) => sendJson(response, 200, {
        model: 'untrusted-response-model', message: { content: 'Red Maple Care', reasoning_content: 'private title reasoning' },
        prompt_eval_count: 15, eval_count: 4,
      }),
    });
    try {
      const data = await fixture(upstream.baseUrl);
      await runJobWorker({
        id: 'pgboss-title-test', name: SESSION_TITLE_JOB_TYPE, data: { jobId: data.job.id },
        signal: new AbortController().signal, retryCount: 0, retryLimit: 0,
      } as JobWithMetadata<JobQueuePayload>, createSessionTitleJobHandler());
      const persistedJob = await integrationPrisma.job.findUniqueOrThrow({ where: { id: data.job.id } });
      expect(persistedJob).toMatchObject({ status: JobStatus.SUCCEEDED, result: { outcome: 'APPLIED' } });
      expect(await integrationPrisma.jobMetric.findUniqueOrThrow({ where: { jobId: data.job.id } }))
        .toMatchObject({ workspaceId: data.workspace.id, jobType: SESSION_TITLE_JOB_TYPE });
      expect(await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: data.session.id } }))
        .toMatchObject({ title: 'Red Maple Care', titleSource: ChatSessionTitleSource.GENERATED });
      const request = JSON.parse(upstream.requests[0].body) as {
        model: string; messages: { content: string }[]; options: { num_predict: number };
      };
      expect(request.model).toBe('actual-reply-model');
      expect(request.options.num_predict).toBe(2048);
      expect(request.messages[1].content).toContain('Private conversation about red maple trees');
      expect(request.messages[1].content).not.toContain('private chain of thought');
      const usage = await integrationPrisma.generationUsage.findMany();
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({
        operation: GenerationUsageOperation.SESSION_TITLE, outcome: GenerationUsageOutcome.SUCCEEDED,
        providerId: data.provider.id, model: 'actual-reply-model', streaming: false,
        inputTokens: 15, outputTokens: 4,
      });
      expect(JSON.stringify({ job: persistedJob, usage })).not.toContain('Red Maple Care');
      expect(JSON.stringify({ job: persistedJob, usage })).not.toContain('Private conversation');
    } finally { await upstream.close(); }
  });

  it('uses the admin configured token limit for title generation', async () => {
    const upstream = await createMockLlmUpstream({
      'POST /api/chat': (_request, response) => sendJson(response, 200, { message: { content: 'Red Maple Care' } }),
    });
    try {
      const data = await fixture(upstream.baseUrl, { maxTokens: 384 });
      expect(await run(data.job)).toEqual({ outcome: 'APPLIED' });
      const request = JSON.parse(upstream.requests[0].body) as { options: { num_predict: number } };
      expect(request.options.num_predict).toBe(384);
    } finally { await upstream.close(); }
  });

  it.each([
    ['NOT_ENOUGH_CONTEXT', 'NOT_ENOUGH_CONTEXT', undefined],
    ['Two\nLines', 'INVALID_TITLE', undefined],
    ['NOT_ENOUGH_CONTEXT ', 'INVALID_TITLE', undefined],
    ['<b>Private markup</b>', 'INVALID_TITLE', undefined],
    ['A'.repeat(61), 'INVALID_TITLE', undefined],
    ['Short but unfinished', 'INVALID_TITLE', 'length'],
    ['Short but unfinished', 'INVALID_TITLE', ' MAX_TOKENS '],
    ['NOT_ENOUGH_CONTEXT', 'INVALID_TITLE', 'length'],
  ])('keeps the placeholder for response %p', async (content, outcome, finishReason?: string) => {
    const upstream = await createMockLlmUpstream({
      'POST /api/chat': (_request, response) => sendJson(response, 200, {
        message: { content }, done_reason: finishReason,
      }),
    });
    try {
      const data = await fixture(upstream.baseUrl);
      expect(await run(data.job)).toEqual({ outcome });
      expect(await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: data.session.id } }))
        .toMatchObject({ title: 'New Chat', titleSource: ChatSessionTitleSource.PLACEHOLDER });
      expect((await integrationPrisma.generationUsage.findFirstOrThrow()).outcome)
        .toBe(GenerationUsageOutcome.SUCCEEDED);
    } finally { await upstream.close(); }
  });

  it('rejects stale, renamed, deleted, and cross-workspace jobs before any provider call', async () => {
    const upstream = await createMockLlmUpstream({});
    try {
      const data = await fixture(upstream.baseUrl);
      expect(await run(data.job, { ...data.payload, assistantMessageId: data.assistant.id + 1 }))
        .toEqual({ outcome: 'NOT_ELIGIBLE' });
      const foreign = await integrationPrisma.workspace.create({
        data: { name: 'Foreign', type: 'STANDARD', ownerUserId: data.owner.id },
      });
      expect(await run({ ...data.job, workspaceId: foreign.id })).toEqual({ outcome: 'NOT_ELIGIBLE' });
      await integrationPrisma.chatSession.update({ where: { id: data.session.id }, data: {
        title: 'Manual name', titleSource: ChatSessionTitleSource.USER,
      } });
      expect(await run(data.job)).toEqual({ outcome: 'NOT_ELIGIBLE' });
      await integrationPrisma.chatSession.delete({ where: { id: data.session.id } });
      expect(await run(data.job)).toEqual({ outcome: 'NOT_ELIGIBLE' });
      expect(upstream.requests).toHaveLength(0);
      expect(await integrationPrisma.generationUsage.count()).toBe(0);
    } finally { await upstream.close(); }
  });

  it('leaves a disabled provider or missing model unchanged', async () => {
    const upstream = await createMockLlmUpstream({
      'POST /api/chat': (_request, response) => sendJson(response, 404, { error: 'private missing model' }),
    });
    try {
      const data = await fixture(upstream.baseUrl);
      await integrationPrisma.llmProviderConfig.update({ where: { id: data.provider.id }, data: { enabled: false } });
      expect(await run(data.job)).toEqual({ outcome: 'PROVIDER_UNAVAILABLE' });
      expect(upstream.requests).toHaveLength(0);
      await integrationPrisma.llmProviderConfig.update({ where: { id: data.provider.id }, data: { enabled: true } });
      expect(await run(data.job)).toEqual({ outcome: 'PROVIDER_UNAVAILABLE' });
      expect(upstream.requests).toHaveLength(1);
      expect(await integrationPrisma.generationUsage.findFirstOrThrow())
        .toMatchObject({ outcome: GenerationUsageOutcome.FAILED, errorCode: 'HTTP_404' });
      expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: data.session.id } })).title)
        .toBe('New Chat');
    } finally { await upstream.close(); }
  });

  it('lets an unexpected provider-resolution failure reach the sanitized worker failure path', async () => {
    const upstream = await createMockLlmUpstream({});
    try {
      const data = await fixture(upstream.baseUrl);
      const failure = new Error('private database connection details');
      const handler = createSessionTitleJobHandler({
        llm: {
          ...LlmRuntimeService,
          resolveGenerationProvider: async () => { throw failure; },
        },
      });
      await expect(runJobWorker({
        id: 'pgboss-title-failure', name: SESSION_TITLE_JOB_TYPE, data: { jobId: data.job.id },
        signal: new AbortController().signal, retryCount: 0, retryLimit: 0,
      } as JobWithMetadata<JobQueuePayload>, handler)).rejects.toBe(failure);
      const persistedJob = await integrationPrisma.job.findUniqueOrThrow({ where: { id: data.job.id } });
      expect(persistedJob).toMatchObject({
        status: JobStatus.FAILED, errorCode: 'JOB_HANDLER_FAILED', sanitizedError: 'Job handler failed.',
      });
      expect(JSON.stringify(persistedJob)).not.toContain('private database connection details');
      expect(upstream.requests).toHaveLength(0);
      expect(await integrationPrisma.generationUsage.count()).toBe(0);
    } finally { await upstream.close(); }
  });

  it('uses no more than three correctly linked exchanges and 6,000 content characters', async () => {
    const upstream = await createMockLlmUpstream({
      'POST /api/chat': (_request, response) => sendJson(response, 200, { message: { content: 'Bounded Topic' } }),
    });
    try {
      const data = await fixture(upstream.baseUrl);
      let latest = data.assistant;
      for (let index = 0; index < 4; index += 1) {
        const user = await integrationPrisma.chatMessage.create({
          data: { sessionId: data.session.id, author: MessageAuthor.USER,
            content: `user-${index}-` + 'u'.repeat(2_400) },
        });
        latest = await integrationPrisma.chatMessage.create({
          data: { sessionId: data.session.id, author: MessageAuthor.ASSISTANT,
            content: `assistant-${index}-` + 'a'.repeat(2_400), triggeringUserMessageId: user.id,
            metadata: { providerId: String(data.provider.id), model: 'actual-reply-model', finishReason: 'stop' } },
        });
      }
      await integrationPrisma.chatSession.update({
        where: { id: data.session.id }, data: { latestEligibleAssistantMessageId: latest.id },
      });
      expect(await run(data.job, { sessionId: data.session.id, assistantMessageId: latest.id }))
        .toEqual({ outcome: 'APPLIED' });
      const request = JSON.parse(upstream.requests[0].body) as { messages: { content: string }[] };
      const pairs = JSON.parse(request.messages[1].content) as { user: string; assistant: string }[];
      expect(pairs.length).toBeLessThanOrEqual(3);
      expect(pairs.at(-1)?.user).toContain('user-3-');
      expect(pairs.at(-1)?.assistant).toContain('assistant-3-');
      expect(pairs.map((pair) => pair.user.length + pair.assistant.length)
        .reduce((sum, length) => sum + length, 0)).toBeLessThanOrEqual(6_000);
      expect(request.messages[1].content).not.toContain('user-0-');
    } finally { await upstream.close(); }
  });

  it('skips linked partial replies while collecting the latest three successful exchanges', async () => {
    const upstream = await createMockLlmUpstream({
      'POST /api/chat': (_request, response) => sendJson(response, 200, { message: { content: 'Maple Topic' } }),
    });
    try {
      const data = await fixture(upstream.baseUrl);
      const middleUser = await integrationPrisma.chatMessage.create({
        data: { sessionId: data.session.id, author: MessageAuthor.USER, content: 'Middle successful prompt' },
      });
      await integrationPrisma.chatMessage.create({
        data: { sessionId: data.session.id, author: MessageAuthor.ASSISTANT,
          content: 'Middle successful reply', triggeringUserMessageId: middleUser.id,
          metadata: { providerId: String(data.provider.id), model: 'actual-reply-model', finishReason: 'stop' } },
      });
      const partialUser = await integrationPrisma.chatMessage.create({
        data: { sessionId: data.session.id, author: MessageAuthor.USER, content: 'Partial prompt' },
      });
      await integrationPrisma.chatMessage.createMany({
        data: Array.from({ length: 26 }, (_, index) => ({
          sessionId: data.session.id, author: MessageAuthor.ASSISTANT,
          content: `Partial reply ${index}`, triggeringUserMessageId: partialUser.id,
          metadata: { providerId: String(data.provider.id), model: 'actual-reply-model',
            finishReason: 'error', incomplete: true },
        })),
      });
      const latestUser = await integrationPrisma.chatMessage.create({
        data: { sessionId: data.session.id, author: MessageAuthor.USER, content: 'Latest successful prompt' },
      });
      const latest = await integrationPrisma.chatMessage.create({
        data: { sessionId: data.session.id, author: MessageAuthor.ASSISTANT,
          content: 'Latest successful reply', triggeringUserMessageId: latestUser.id,
          metadata: { providerId: String(data.provider.id), model: 'actual-reply-model', finishReason: 'stop' } },
      });
      await integrationPrisma.chatSession.update({
        where: { id: data.session.id }, data: { latestEligibleAssistantMessageId: latest.id },
      });

      expect(await run(data.job, { sessionId: data.session.id, assistantMessageId: latest.id }))
        .toEqual({ outcome: 'APPLIED' });
      const request = JSON.parse(upstream.requests[0].body) as { messages: { content: string }[] };
      const pairs = JSON.parse(request.messages[1].content) as { user: string; assistant: string }[];
      expect(pairs.map((pair) => pair.user)).toEqual([
        data.user.content, 'Middle successful prompt', 'Latest successful prompt',
      ]);
      expect(request.messages[1].content).not.toContain('Partial reply');
    } finally { await upstream.close(); }
  });

  it('rejects a linked user from another session before the model call', async () => {
    const upstream = await createMockLlmUpstream({});
    try {
      const data = await fixture(upstream.baseUrl);
      const otherSession = await integrationPrisma.chatSession.create({
        data: { userId: data.owner.id, workspaceId: data.workspace.id, title: 'Other' },
      });
      const foreignUser = await integrationPrisma.chatMessage.create({
        data: { sessionId: otherSession.id, author: MessageAuthor.USER, content: 'Foreign private message' },
      });
      await integrationPrisma.chatMessage.update({
        where: { id: data.assistant.id }, data: { triggeringUserMessageId: foreignUser.id },
      });
      expect(await run(data.job)).toEqual({ outcome: 'NOT_ELIGIBLE' });
      expect(upstream.requests).toHaveLength(0);
    } finally { await upstream.close(); }
  });

  it('does not overwrite a manual rename made while the model runs', async () => {
    let respond: () => void = () => {};
    let received: () => void = () => {};
    const requestReceived = new Promise<void>((resolve) => { received = resolve; });
    const upstream = await createMockLlmUpstream({
      'POST /api/chat': (_request, response) => {
        respond = () => sendJson(response, 200, { message: { content: 'Generated Name' } });
        received();
      },
    });
    try {
      const data = await fixture(upstream.baseUrl);
      const pending = run(data.job);
      await requestReceived;
      await integrationPrisma.chatSession.update({ where: { id: data.session.id }, data: {
        title: 'Manual Name', titleSource: ChatSessionTitleSource.USER,
      } });
      respond();
      expect(await pending).toEqual({ outcome: 'NOT_ELIGIBLE' });
      expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: data.session.id } })).title)
        .toBe('Manual Name');
    } finally { await upstream.close(); }
  });

  it('rejects malformed payloads without making a provider call', async () => {
    const upstream = await createMockLlmUpstream({});
    try {
      const data = await fixture(upstream.baseUrl);
      await expect(run(data.job, { ...data.payload, content: 'private' }))
        .rejects.toMatchObject({ code: 'SESSION_TITLE_PAYLOAD_INVALID' });
      expect(upstream.requests).toHaveLength(0);
    } finally { await upstream.close(); }
  });

  it('passes a worker shutdown signal to the provider and records an aborted model call', async () => {
    let received: () => void = () => {};
    const requestReceived = new Promise<void>((resolve) => { received = resolve; });
    const upstream = await createMockLlmUpstream({
      'POST /api/chat': () => { received(); },
    });
    try {
      const data = await fixture(upstream.baseUrl);
      const shutdown = new AbortController();
      const pending = run(data.job, data.payload, shutdown.signal);
      await requestReceived;
      shutdown.abort();
      await expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
      expect(await integrationPrisma.generationUsage.findFirstOrThrow())
        .toMatchObject({ outcome: GenerationUsageOutcome.ABORTED });
    } finally { await upstream.close(); }
  });

  it('uses the configured provider deadline and records a failed model call', async () => {
    const upstream = await createMockLlmUpstream({ 'POST /api/chat': () => undefined });
    try {
      const data = await fixture(upstream.baseUrl, { timeoutMs: 25 });
      await expect(run(data.job)).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
      expect(await integrationPrisma.generationUsage.findFirstOrThrow())
        .toMatchObject({ outcome: GenerationUsageOutcome.FAILED, errorCode: 'REQUEST_TIMEOUT' });
      expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: data.session.id } })).title)
        .toBe('New Chat');
    } finally { await upstream.close(); }
  });
});
