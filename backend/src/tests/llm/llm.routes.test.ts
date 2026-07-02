import { describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from '../../errors';
import { authenticate, authorizeRoles } from '../../middleware';
import { LlmController } from '../../modules/llm/llm.controller';
import { SelectedLlmProviderConfig } from '../../modules/llm/llmProviderConfig.model';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';
import { UserRole, UserStatus } from '../../modules/user/user.model';
import {
  createAuthenticatedMockRequest,
  createMockNext,
  createMockResponse,
} from '../testUtils';
import { mockPrisma } from '../setup';

jest.mock('node-fetch', () => jest.fn());

function createProvider(overrides: Partial<SelectedLlmProviderConfig> = {}): SelectedLlmProviderConfig {
  return {
    id: 1,
    name: 'Local Ollama',
    type: 'OLLAMA',
    baseUrl: 'http://localhost:11434',
    enabled: true,
    defaultModel: 'llama2',
    timeoutMs: 5000,
    extraHeaders: {},
    apiKey: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('LLM route authorization boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks unauthenticated requests from common model listing', () => {
    const req = createAuthenticatedMockRequest({ headers: {} });
    const res = createMockResponse();
    const next = createMockNext();

    expect(() => authenticate(req, res, next)).toThrow(AuthenticationError);
  });

  it('allows authenticated USER requests to common model listing', async () => {
    jest.spyOn(OllamaProvider.prototype, 'listModels')
      .mockResolvedValue(['llama2']);
    (jwt.verify as jest.Mock).mockReturnValue({
      id: 1,
      email: 'user@example.com',
      name: 'User',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
    });
    mockPrisma.llmProviderConfig.findMany.mockResolvedValue([createProvider()]);
    const req = createAuthenticatedMockRequest({
      headers: { authorization: 'Bearer valid-user-token' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    authenticate(req, res, next);
    await LlmController.listAvailableModels(req, res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        models: [expect.objectContaining({ modelId: 'llama2' })],
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
