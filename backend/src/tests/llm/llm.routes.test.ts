import { describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from '../../errors';
import { authenticate, authorizeRoles } from '../../middleware';
import { LlmController } from '../../modules/llm/llm.controller';
import { SelectedLlmProviderConfig } from '../../modules/llm/llmProviderConfig.model';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';
import { UserRole, UserStatus } from '../../modules/user/user.model';
import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
import {
  createAuthenticatedMockRequest,
  createMockNext,
  createMockResponse,
} from '../testUtils';
import { mockPrisma } from '../setup';

jest.mock('node-fetch', () => jest.fn());

const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;

function createListedModel(modelName: string) {
  return {
    modelId: modelName,
    modelName,
    capabilities: {
      completion: 'UNKNOWN' as const,
      streaming: 'UNKNOWN' as const,
      reasoning: 'UNKNOWN' as const,
      embeddings: 'UNKNOWN' as const,
      toolCalling: 'UNKNOWN' as const,
      structuredOutput: 'UNKNOWN' as const,
      tokenCounting: 'UNKNOWN' as const,
    },
  };
}

function createProvider(overrides: Partial<SelectedLlmProviderConfig> = {}): SelectedLlmProviderConfig {
  return {
    id: 1,
    name: 'Local Ollama',
    type: 'OLLAMA',
    baseUrl: 'http://localhost:11434',
    enabled: true,
    defaultModel: TEST_MODEL_ID,
    timeoutMs: 5000,
    generationDefaults: {},
    extraHeaders: {},
    apiKey: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createWorkspace() {
  return {
    id: 25,
    name: 'Personal Workspace',
    ownerUserId: 1,
    type: WorkspaceType.PERSONAL,
    status: WorkspaceStatus.ACTIVE,
  };
}

describe('LLM route authorization boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks unauthenticated requests from common model listing', async () => {
    const req = createAuthenticatedMockRequest({ headers: {} });
    const res = createMockResponse();
    const next = createMockNext();

    await expect(authenticate(req, res, next)).rejects.toThrow(AuthenticationError);
  });

  it('blocks unauthenticated requests from provider-specific model listing', async () => {
    const req = createAuthenticatedMockRequest({ headers: {} });
    const res = createMockResponse();
    const next = createMockNext();

    await expect(authenticate(req, res, next)).rejects.toThrow(AuthenticationError);
  });

  it('allows authenticated USER requests to common model listing', async () => {
    jest.spyOn(OllamaProvider.prototype, 'listModels')
      .mockResolvedValue([createListedModel(TEST_MODEL_ID)]);
    (jwt.verify as jest.Mock).mockReturnValue({
      id: 1,
      email: 'user@example.com',
      name: 'User',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
    });
    mockPrisma.llmProviderConfig.findMany.mockResolvedValue([createProvider()]);
    mockPrisma.workspace.findFirst.mockResolvedValue(createWorkspace());
    const req = createAuthenticatedMockRequest({
      headers: { authorization: 'Bearer valid-user-token', 'x-workspace-id': '25' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);
    await LlmController.listAvailableModels(req, res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        models: [expect.objectContaining({ modelId: TEST_MODEL_ID })],
      }),
    });
  });

  it('allows authenticated USER requests to provider-specific model listing', async () => {
    jest.spyOn(OllamaProvider.prototype, 'listModels')
      .mockResolvedValue([createListedModel(TEST_MODEL_ID)]);
    (jwt.verify as jest.Mock).mockReturnValue({
      id: 1,
      email: 'user@example.com',
      name: 'User',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
    });
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProvider());
    mockPrisma.workspace.findFirst.mockResolvedValue(createWorkspace());
    const req = createAuthenticatedMockRequest({
      headers: { authorization: 'Bearer valid-user-token', 'x-workspace-id': '25' },
      params: { id: '1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await authenticate(req, res, next);
    await LlmController.listProviderModels(req, res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        models: [expect.objectContaining({ providerId: '1', modelId: TEST_MODEL_ID })],
      }),
    });
  });

  it('blocks USER requests from admin LLM routes', () => {
    const req = createAuthenticatedMockRequest({
      user: {
        id: 1,
        email: 'user@example.com',
        name: 'User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    expect(() => authorizeRoles(UserRole.ADMIN)(req, res, next)).toThrow(AuthenticationError);
  });
});
