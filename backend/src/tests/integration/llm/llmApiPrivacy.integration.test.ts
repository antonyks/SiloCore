import { Server, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { MessageAuthor, UserRole } from '@prisma/client';
import app from '../../../app';
import { logger } from '../../../config/logger';
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
  MockLlmUpstream,
  sendJson,
} from '../helpers/mockLlmUpstream';

const MODEL_ID = 'privacy-model';
const SECOND_MODEL_ID = 'privacy-model-two';
const API_SECRET = 'privacy-api-secret';
const UPDATED_API_SECRET = 'updated-privacy-api-secret';
const PRIVATE_PROMPT = 'Private HTTP prompt';
const PRIVATE_ANSWER = 'Private HTTP answer';
const PRIVATE_REASONING = 'Private HTTP reasoning';
const PRIVATE_OTHER_WORKSPACE_CONTENT = 'Private other workspace content';

type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

type TestUserContext = {
  user: Awaited<ReturnType<typeof createIntegrationTestUser>>;
  workspace: Awaited<ReturnType<typeof WorkspaceProvisioningService.ensurePersonalWorkspaceForUser>>['workspace'];
  headers: Record<string, string>;
};

function createOpenAiRoutes(modelId = MODEL_ID) {
  return {
    'GET /models': (_request: unknown, res: ServerResponse) => {
      sendJson(res, 200, { object: 'list', data: [{ id: modelId, object: 'model' }] });
    },
    'POST /chat/completions': (request: { body: string }, res: ServerResponse) => {
      const body = JSON.parse(request.body) as { stream?: boolean };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: `${PRIVATE_REASONING} ` } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: PRIVATE_ANSWER } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      sendJson(res, 200, {
        model: MODEL_ID,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: PRIVATE_ANSWER,
              reasoning_content: PRIVATE_REASONING,
            },
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      });
    },
  };
}

function signToken(user: TestUserContext['user']): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: '1d' },
  );
}

async function startTestServer(): Promise<TestServer> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => {
      listeningServer.off('error', reject);
      resolve(listeningServer);
    });
    listeningServer.once('error', reject);
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Failed to bind integration test API server.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function createUserContext(role: UserRole): Promise<TestUserContext> {
  const user = await createIntegrationTestUser({ role });
  const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(user.id);

  return {
    user,
    workspace,
    headers: {
      authorization: `Bearer ${signToken(user)}`,
      'x-workspace-id': String(workspace.id),
      'content-type': 'application/json',
    },
  };
}

async function requestJson<T = unknown>(
  server: TestServer,
  path: string,
  init: RequestInit,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${server.baseUrl}${path}`, init);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as T : undefined as T,
  };
}

async function createPersistedOpenAiProvider(upstream: MockLlmUpstream, apiKey = API_SECRET) {
  return integrationPrisma.llmProviderConfig.create({
    data: {
      name: 'Privacy OpenAI Compatible',
      type: 'OPENAI_COMPATIBLE',
      baseUrl: upstream.baseUrl,
      enabled: true,
      defaultModel: MODEL_ID,
      timeoutMs: 5000,
      generationDefaults: {},
      extraHeaders: { 'X-Provider-Header': 'non-api-secret-header' },
      apiKey,
    },
  });
}

function expectNoApiSecrets(value: unknown): void {
  const text = JSON.stringify(value);
  expect(text).not.toContain(API_SECRET);
  expect(text).not.toContain(UPDATED_API_SECRET);
  expect(text).not.toContain('apiKey');
}

function loggedPayloadText(): string {
  return JSON.stringify([
    ...jest.mocked(logger.info).mock.calls.map(([payload]) => payload),
    ...jest.mocked(logger.error).mock.calls.map(([payload]) => payload),
  ]);
}

beforeEach(async () => {
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  await resetIntegrationDatabase();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LLM API response privacy integration', () => {
  it('keeps API keys out of admin provider API responses', async () => {
    const server = await startTestServer();
    const upstream = await createMockLlmUpstream(createOpenAiRoutes());

    try {
      const admin = await createUserContext(UserRole.ADMIN);

      const createResponse = await requestJson<{ data: Record<string, unknown> }>(
        server,
        '/api/admin/llm/providers',
        {
          method: 'POST',
          headers: admin.headers,
          body: JSON.stringify({
            name: 'Created Privacy Provider',
            type: 'openai-compatible',
            baseUrl: upstream.baseUrl,
            enabled: true,
            defaultModel: MODEL_ID,
            timeoutMs: 5000,
            extraHeaders: { 'X-Provider-Header': 'non-api-secret-header' },
            apiKey: API_SECRET,
          }),
        },
      );
      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data).toEqual(expect.objectContaining({
        name: 'Created Privacy Provider',
        type: 'openai-compatible',
        hasApiKey: true,
      }));

      const providerId = createResponse.body.data.id as number;
      const updateResponse = await requestJson<{ data: Record<string, unknown> }>(
        server,
        `/api/admin/llm/providers/${providerId}`,
        {
          method: 'PUT',
          headers: admin.headers,
          body: JSON.stringify({ defaultModel: SECOND_MODEL_ID, apiKey: UPDATED_API_SECRET }),
        },
      );
      const listResponse = await requestJson(server, '/api/admin/llm/providers', {
        method: 'GET',
        headers: admin.headers,
      });
      const detailResponse = await requestJson(server, `/api/admin/llm/providers/${providerId}`, {
        method: 'GET',
        headers: admin.headers,
      });
      const testResponse = await requestJson(server, `/api/admin/llm/providers/${providerId}/test`, {
        method: 'POST',
        headers: admin.headers,
      });

      expect(updateResponse.status).toBe(200);
      expect(listResponse.status).toBe(200);
      expect(detailResponse.status).toBe(200);
      expect(testResponse.status).toBe(200);
      expect(testResponse.body).toEqual({
        data: {
          providerId: String(providerId),
          providerName: 'Created Privacy Provider',
          providerType: 'openai-compatible',
          status: 'success',
        },
      });
      expectNoApiSecrets([
        createResponse.body,
        updateResponse.body,
        listResponse.body,
        detailResponse.body,
        testResponse.body,
      ]);
      expectNoApiSecrets(loggedPayloadText());
    } finally {
      await Promise.all([upstream.close(), server.close()]);
    }
  });

  it('keeps API keys out of model-registry API responses', async () => {
    const server = await startTestServer();
    const upstream = await createMockLlmUpstream(createOpenAiRoutes());

    try {
      const user = await createUserContext(UserRole.USER);
      const provider = await createPersistedOpenAiProvider(upstream);

      const registryResponse = await requestJson<{ data: { models: unknown[]; providers: unknown[] } }>(
        server,
        '/api/llm/models',
        {
          method: 'GET',
          headers: user.headers,
        },
      );
      const providerRegistryResponse = await requestJson<{ data: { models: unknown[]; providers: unknown[] } }>(
        server,
        `/api/llm/providers/${provider.id}/models`,
        {
          method: 'GET',
          headers: user.headers,
        },
      );

      expect(registryResponse.status).toBe(200);
      expect(providerRegistryResponse.status).toBe(200);
      expect(registryResponse.body.data.models).toEqual([
        expect.objectContaining({
          providerId: String(provider.id),
          providerType: 'openai-compatible',
          modelId: MODEL_ID,
          capabilities: expect.objectContaining({
            completion: 'UNKNOWN',
            streaming: 'UNKNOWN',
            reasoning: 'UNKNOWN',
            embeddings: 'UNKNOWN',
          }),
        }),
      ]);
      expect(registryResponse.body.data.providers).toEqual([
        expect.objectContaining({
          providerId: String(provider.id),
          providerType: 'openai-compatible',
          status: 'success',
          capabilities: expect.objectContaining({
            completion: true,
            streaming: true,
            modelListing: true,
            embeddings: true,
          }),
        }),
      ]);
      expect(providerRegistryResponse.body.data).toEqual(registryResponse.body.data);
      expectNoApiSecrets([registryResponse.body, providerRegistryResponse.body]);
      expectNoApiSecrets(loggedPayloadText());
    } finally {
      await Promise.all([upstream.close(), server.close()]);
    }
  });

  it('returns chat generation content only to the owning workspace and never includes API keys', async () => {
    const server = await startTestServer();
    const upstream = await createMockLlmUpstream(createOpenAiRoutes());

    try {
      const owner = await createUserContext(UserRole.USER);
      const intruder = await createUserContext(UserRole.USER);
      const provider = await createPersistedOpenAiProvider(upstream);
      const session = await createIntegrationChatSession(owner.user.id, {
        workspace: { connect: { id: owner.workspace.id } },
      });
      await createIntegrationChatMessage(session.id, {
        content: PRIVATE_OTHER_WORKSPACE_CONTENT,
        author: MessageAuthor.USER,
      });

      const ownerResponse = await requestJson<{ data: Record<string, unknown> }>(
        server,
        `/api/chat/${session.id}/generate`,
        {
          method: 'POST',
          headers: owner.headers,
          body: JSON.stringify({
            content: PRIVATE_PROMPT,
            providerId: provider.id,
          }),
        },
      );
      expect(ownerResponse.status).toBe(201);
      expect(ownerResponse.body.data).toEqual({
        userMessage: expect.objectContaining({
          content: PRIVATE_PROMPT,
          author: MessageAuthor.USER,
        }),
        assistantMessage: expect.objectContaining({
          content: PRIVATE_ANSWER,
          author: MessageAuthor.ASSISTANT,
          metadata: expect.objectContaining({
            providerId: String(provider.id),
            providerType: 'openai-compatible',
            model: MODEL_ID,
            reasoning: PRIVATE_REASONING,
            finishReason: 'stop',
          }),
        }),
      });
      expectNoApiSecrets(ownerResponse.body);

      const intruderGenerateResponse = await requestJson(
        server,
        `/api/chat/${session.id}/generate`,
        {
          method: 'POST',
          headers: intruder.headers,
          body: JSON.stringify({
            content: 'Intruder prompt',
            providerId: provider.id,
          }),
        },
      );
      const intruderMessagesResponse = await requestJson(
        server,
        `/api/chat/${session.id}/messages`,
        {
          method: 'GET',
          headers: intruder.headers,
        },
      );

      expect(intruderGenerateResponse.status).toBe(404);
      expect(intruderMessagesResponse.status).toBe(404);
      const deniedText = JSON.stringify([intruderGenerateResponse.body, intruderMessagesResponse.body]);
      expect(deniedText).not.toContain(PRIVATE_PROMPT);
      expect(deniedText).not.toContain(PRIVATE_ANSWER);
      expect(deniedText).not.toContain(PRIVATE_REASONING);
      expect(deniedText).not.toContain(PRIVATE_OTHER_WORKSPACE_CONTENT);
      expectNoApiSecrets([intruderGenerateResponse.body, intruderMessagesResponse.body]);
      expectNoApiSecrets(loggedPayloadText());
    } finally {
      await Promise.all([upstream.close(), server.close()]);
    }
  });

  it('keeps API keys out of chat streaming SSE response bodies', async () => {
    const server = await startTestServer();
    const upstream = await createMockLlmUpstream(createOpenAiRoutes());

    try {
      const owner = await createUserContext(UserRole.USER);
      const provider = await createPersistedOpenAiProvider(upstream);
      const session = await createIntegrationChatSession(owner.user.id, {
        workspace: { connect: { id: owner.workspace.id } },
      });

      const response = await fetch(`${server.baseUrl}/api/chat/${session.id}/generate/stream`, {
        method: 'POST',
        headers: owner.headers,
        body: JSON.stringify({
          content: PRIVATE_PROMPT,
          providerId: provider.id,
        }),
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain('event: user_message');
      expect(body).toContain('event: delta');
      expect(body).toContain('event: assistant_message');
      expect(body).toContain('event: done');
      expect(body).toContain(PRIVATE_PROMPT);
      expect(body).toContain(PRIVATE_ANSWER);
      expect(body).toContain(PRIVATE_REASONING);
      expectNoApiSecrets(body);
      expectNoApiSecrets(loggedPayloadText());
    } finally {
      await Promise.all([upstream.close(), server.close()]);
    }
  });
});
