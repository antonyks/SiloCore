jest.mock('node-fetch', () => jest.fn());
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

import jwt from 'jsonwebtoken';
import { JobStatus, MessageAuthor, UserRole, WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { createApiComposition } from '../../composition/api';
import { createCoreServices } from '../../composition/coreServices';
import { createLlmRuntimeService } from '../../modules/llm/llmRuntime.service';
import { createChatService } from '../../modules/chat/chat.service';
import { ChatRepository } from '../../modules/chat/chat.repository';
import { createWorkspaceService } from '../../modules/workspace/workspace.service';
import { WorkspaceRepository } from '../../modules/workspace/workspace.repository';
import { CoreSingleOwnerWorkspaceAuthorizationPolicy } from '../../modules/workspace/coreSingleOwnerWorkspaceAuthorization.policy';
import { WorkspaceAuthorizationPolicy, WorkspaceAction } from '../../modules/workspace/workspaceAuthorization.types';
import { LlmProviderConfigRepository } from '../../modules/llm/llmProviderConfig.repository';
import { SelectedLlmProviderConfig } from '../../modules/llm/llmProviderConfig.model';
import { ILlmProvider } from '../../modules/llm/llm.interface';
import { LlmProviderConfig, UNSUPPORTED_LLM_PROVIDER_CAPABILITIES } from '../../modules/llm/llm.types';
import { createAdminSystemController } from '../../modules/admin/system/adminSystem.controller';
import { NotFoundError } from '../../errors';
import { SelectedJob } from '../../modules/job/job.model';
import { createJobService } from '../../modules/job/job.service';
import { mockPrisma } from '../setup';
import { createAuthenticatedMockRequest, createMockNext, createMockResponse } from '../testUtils';

const workspace = {
  id: 25, name: 'Private', ownerUserId: 1,
  type: WorkspaceType.STANDARD, status: WorkspaceStatus.ACTIVE,
  createdAt: new Date(), updatedAt: new Date(),
};
const context = { workspace, actor: { userId: 1, role: UserRole.USER } };

function replacementPolicy(allowed: boolean): WorkspaceAuthorizationPolicy {
  return {
    resolveActor: jest.fn((user) => user ? { userId: user.id, role: user.role } : null),
    checkWorkspaceAccess: jest.fn(() => ({ allowed })),
    checkWorkspaceAction: jest.fn(() => ({ allowed })),
  };
}

function provider(config: LlmProviderConfig, model: string): ILlmProvider {
  return {
    id: config.id, type: config.type, config, isEnabled: config.enabled,
    capabilities: { ...UNSUPPORTED_LLM_PROVIDER_CAPABILITIES, modelListing: true },
    initialise: async () => undefined,
    destroy: async () => undefined,
    complete: async () => { throw new Error('unused'); },
    streamComplete: async function* () { /* unused */ },
    embed: async () => { throw new Error('unused'); },
    listModels: async () => [{ modelId: model, modelName: model, capabilities: { completion: 'UNKNOWN', streaming: 'UNKNOWN', reasoning: 'UNKNOWN', embeddings: 'UNKNOWN', toolCalling: 'UNKNOWN', structuredOutput: 'UNKNOWN', tokenCounting: 'UNKNOWN' } }],
  };
}

function providerOperationGraph(name: string) {
  const row: SelectedLlmProviderConfig = {
    id: 7, name, type: 'OLLAMA', enabled: true, baseUrl: `http://unused/${name}`,
    apiKey: null, defaultModel: 'default', timeoutMs: null, generationDefaults: null,
    extraHeaders: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
  const findById = jest.fn<Promise<SelectedLlmProviderConfig | null>, [number]>().mockResolvedValue(row);
  const initialise = jest.fn(async () => undefined);
  const pullModel = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
  const adapterFactory = jest.fn((config: LlmProviderConfig): ILlmProvider => ({
    ...provider(config, 'default'),
    capabilities: { ...UNSUPPORTED_LLM_PROVIDER_CAPABILITIES, modelPulling: true },
    initialise,
    pullModel,
  }));
  const healthSamples = { recordSample: jest.fn() };
  const llm = createLlmRuntimeService({
    repository: { ...LlmProviderConfigRepository, findById },
    adapterFactories: { ollama: adapterFactory },
    healthSamples,
  });
  return {
    row, findById, initialise, pullModel, adapterFactory,
    services: createCoreServices({ llm, healthSamples }),
  };
}

describe('Core composition', () => {
  it('uses the supplied policy for middleware, chat and workspace services', async () => {
    const policy = replacementPolicy(false);
    const api = createApiComposition({ policy });
    const decoded = { id: 1, role: UserRole.USER };
    (jwt.verify as jest.Mock).mockReturnValue(decoded);
    mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
    const req = createAuthenticatedMockRequest({
      headers: { authorization: 'Bearer token', 'x-workspace-id': '25' },
    });
    await expect(api.authenticate(req, createMockResponse(), createMockNext())).rejects.toThrow(NotFoundError);
    await expect(api.services.chat.getWorkspaceSessions({}, context)).rejects.toThrow(NotFoundError);
    await expect(api.services.workspace.updateWorkspace(25, 1, { name: 'Rename' }, UserRole.USER)).rejects.toThrow(NotFoundError);
    expect(policy.checkWorkspaceAccess).toHaveBeenCalledWith(context.actor, workspace);
    expect(policy.checkWorkspaceAction).toHaveBeenCalledWith(context.actor, workspace, WorkspaceAction.READ_WORKSPACE);
    expect(policy.checkWorkspaceAction).toHaveBeenCalledWith(context.actor, workspace, WorkspaceAction.UPDATE_WORKSPACE);
    expect(mockPrisma.chatSession.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.workspace.update).not.toHaveBeenCalled();
  });

  it('isolates policies and repositories without replacing imported modules', async () => {
    const list = jest.fn(async () => []);
    const allowed = createChatService({
      policy: replacementPolicy(true), repository: { ...ChatRepository, listSessionsInWorkspace: list },
    });
    const denied = createChatService({ policy: replacementPolicy(false) });
    await expect(allowed.getWorkspaceSessions({}, context)).resolves.toEqual([]);
    await expect(denied.getWorkspaceSessions({}, context)).rejects.toThrow(NotFoundError);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ workspaceId: 25 });
    const rename = jest.fn(async () => workspace);
    const workspaces = createWorkspaceService({
      policy: replacementPolicy(true),
      repository: {
        ...WorkspaceRepository,
        findActiveOwnedWorkspaceById: async () => workspace,
        updateWorkspaceName: rename,
      },
    });
    await workspaces.updateWorkspace(25, 1, { name: ' Updated ' });
    expect(rename).toHaveBeenCalledWith(25, 'Updated');
    expect(createCoreServices().policy).toBeInstanceOf(CoreSingleOwnerWorkspaceAuthorizationPolicy);
  });

  it('isolates adapter registrations and records health through the supplied service', async () => {
    const row: SelectedLlmProviderConfig = {
      id: 7, name: 'Test provider', type: 'OLLAMA', enabled: true, baseUrl: 'http://unused',
      apiKey: null, defaultModel: 'default', timeoutMs: null, generationDefaults: null,
      extraHeaders: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    const repository = { ...LlmProviderConfigRepository, findActive: async () => [row] };
    const recordSample = jest.fn(async () => { throw new Error('best-effort metric failure'); });
    const a = createLlmRuntimeService({
      repository, adapterFactories: { ollama: (config) => provider(config, 'model-a') },
      healthSamples: { recordSample },
    });
    const b = createLlmRuntimeService({
      repository, adapterFactories: { ollama: (config) => provider(config, 'model-b') },
      healthSamples: { recordSample },
    });
    expect((await a.listAvailableModels()).models[0].modelId).toBe('model-a');
    expect((await b.listAvailableModels()).models[0].modelId).toBe('model-b');
    expect(recordSample).toHaveBeenCalledTimes(2);
    const unavailable = createLlmRuntimeService({ repository, adapterFactories: {}, healthSamples: { recordSample } });
    expect((await unavailable.listAvailableModels()).providers[0]).toMatchObject({ status: 'error' });
  });

  it.each(['testProvider', 'pullProviderModel'] as const)(
    '%s uses each graph\'s injected provider repository and adapter',
    async (operation) => {
      const a = providerOperationGraph('provider-a');
      const b = providerOperationGraph('provider-b');
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue({ ...a.row, name: 'Global provider' });
      const invoke = (services: ReturnType<typeof createCoreServices>) => operation === 'testProvider'
        ? services.providers.testProvider(7)
        : services.providers.pullProviderModel(7, 'requested-model');

      for (const graph of [a, b]) {
        await expect(invoke(graph.services)).resolves.toMatchObject({
          providerId: '7', providerName: graph.row.name, status: 'success',
        });
        expect(graph.findById).toHaveBeenCalledTimes(1);
        expect(graph.findById).toHaveBeenCalledWith(7);
        expect(graph.adapterFactory).toHaveBeenCalledTimes(1);
        expect(graph.adapterFactory).toHaveBeenCalledWith(expect.objectContaining({
          id: '7', name: graph.row.name, baseUrl: graph.row.baseUrl,
        }));
        if (operation === 'testProvider') {
          expect(graph.initialise).toHaveBeenCalledTimes(1);
          expect(graph.pullModel).not.toHaveBeenCalled();
        } else {
          expect(graph.pullModel).toHaveBeenCalledTimes(1);
          expect(graph.pullModel).toHaveBeenCalledWith('requested-model');
          expect(graph.initialise).not.toHaveBeenCalled();
        }
      }
      expect(mockPrisma.llmProviderConfig.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['testProvider', 'pullProviderModel'] as const)(
    '%s rejects a missing injected provider without falling back to the global repository',
    async (operation) => {
      const graph = providerOperationGraph('provider');
      graph.findById.mockResolvedValue(null);
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(graph.row);
      const result = operation === 'testProvider'
        ? graph.services.providers.testProvider(7)
        : graph.services.providers.pullProviderModel(7, 'requested-model');

      await expect(result).rejects.toThrow(NotFoundError);
      expect(graph.findById).toHaveBeenCalledTimes(1);
      expect(graph.findById).toHaveBeenCalledWith(7);
      expect(graph.adapterFactory).not.toHaveBeenCalled();
      expect(mockPrisma.llmProviderConfig.findUnique).not.toHaveBeenCalled();
    },
  );

  it('passes an overridden analytics service through controllers and keeps graph instances independent', async () => {
    const defaults = createCoreServices();
    const summary = { ...await fakeSummary(), users: { total: 100, active: 100, banned: 0, deleted: 0, review: 0 } };
    const analytics = { ...defaults.analytics, getAnalyticsSummary: jest.fn(async () => summary) };
    const a = createApiComposition({ analytics });
    const b = createApiComposition();
    expect(a.services.analytics).toBe(analytics);
    expect(b.services.analytics).not.toBe(analytics);
    expect(a.services.jobs).not.toBe(b.services.jobs);
    expect(a.services.policy).not.toBe(b.services.policy);
    const response = createMockResponse();
    await createAdminSystemController({ serviceDependency: a.services.analytics }).getAnalyticsSummary(
      createAuthenticatedMockRequest({ query: { from: '2026-01-01' } }), response,
    );
    expect(analytics.getAnalyticsSummary).toHaveBeenCalledWith({ from: '2026-01-01' });
    expect(response.json).toHaveBeenCalledWith({ data: summary });
  });

  it('records generation usage through the composed replacement without changing chat delivery', async () => {
    const row: SelectedLlmProviderConfig = {
      id: 7, name: 'Test', type: 'OLLAMA', enabled: true, baseUrl: 'http://unused',
      apiKey: null, defaultModel: 'model', timeoutMs: null, generationDefaults: null,
      extraHeaders: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(row);
    const session = {
      id: 9, workspaceId: workspace.id, userId: 1, title: 'Chat', messages: [],
      createdAt: new Date(), updatedAt: new Date(),
    };
    mockPrisma.chatSession.findFirst.mockResolvedValue(session);
    mockPrisma.chatMessage.create.mockResolvedValue({
      id: 1, sessionId: 9, content: 'answer', author: MessageAuthor.ASSISTANT,
      metadata: null, createdAt: new Date(),
    });
    const usage = { recordGeneration: jest.fn(async () => { throw new Error('usage sink unavailable'); }) };
    const services = createCoreServices({ usage, providerFactories: {
      ollama: (config) => ({
        ...provider(config, 'model'),
        capabilities: { ...UNSUPPORTED_LLM_PROVIDER_CAPABILITIES, completion: true },
        complete: async () => ({ providerId: config.id, model: 'model', content: 'answer', latencyMs: 1 }),
      }),
    } });
    await expect(services.chat.generateAssistantResponse({ sessionId: 9, providerId: 7, content: 'prompt' }, context)).resolves.toMatchObject({
      assistantMessage: { content: 'answer' },
    });
    expect(usage.recordGeneration).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 25, providerId: 7, outcome: 'SUCCEEDED', streaming: false,
    }));
    expect(mockPrisma.generationUsage.create).not.toHaveBeenCalled();
  });

  it('records terminal metrics through a replacement sink and notification function', async () => {
    const job: SelectedJob = {
      id: 5, workspaceId: 25, createdByUserId: 1, type: 'test', status: JobStatus.RUNNING,
      progress: 0, stage: 'running', payload: {}, result: null, errorCode: null, sanitizedError: null,
      attempts: 1, maxAttempts: 1, queueMessageId: 'message', createdAt: new Date(),
      startedAt: new Date(), completedAt: null, heartbeatAt: null, cancelRequestedAt: null,
    };
    const finished = { ...job, status: JobStatus.SUCCEEDED, completedAt: new Date() };
    mockPrisma.job.findUnique.mockResolvedValue(job);
    mockPrisma.job.update.mockResolvedValue(finished);
    const metrics = { recordFinalizedJob: jest.fn(async () => null) };
    const notify = jest.fn(async () => undefined);
    await expect(createJobService({ metrics, notify }).markSucceeded(5)).resolves.toBe(finished);
    expect(metrics.recordFinalizedJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: 5, outcome: 'SUCCEEDED' }), undefined);
    expect(notify).toHaveBeenCalledWith(5, 'succeeded');
    expect(mockPrisma.jobMetric.create).not.toHaveBeenCalled();
  });
});

async function fakeSummary() {
  // Exercise the real aggregate service against the existing DB-free harness.
  for (const delegate of [mockPrisma.user, mockPrisma.llmProviderConfig, mockPrisma.job,
    mockPrisma.generationUsage, mockPrisma.jobMetric, mockPrisma.providerHealthSample]) {
    delegate.count.mockResolvedValue(0);
  }
  mockPrisma.generationUsage.groupBy.mockResolvedValue([]);
  mockPrisma.generationUsage.aggregate.mockResolvedValue({ _avg: { latencyMs: null }, _sum: { inputTokens: null, outputTokens: null, totalTokens: null } });
  mockPrisma.job.groupBy.mockResolvedValue([]);
  mockPrisma.jobMetric.groupBy.mockResolvedValue([]);
  mockPrisma.jobMetric.aggregate.mockResolvedValue({ _avg: { queueWaitMs: null, executionDurationMs: null, attempts: null } });
  mockPrisma.providerHealthSample.groupBy.mockResolvedValue([]);
  mockPrisma.providerHealthSample.aggregate.mockResolvedValue({ _avg: { latencyMs: null } });
  mockPrisma.providerHealthSample.findFirst.mockResolvedValue(null);
  return createCoreServices().analytics.getAnalyticsSummary();
}
