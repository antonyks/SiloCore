import { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { JobStatus, UserRole } from '@prisma/client';
import { createApp } from '../../../app';
import { createApiComposition } from '../../../composition/api';
import { createWorkerComposition } from '../../../composition/worker';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';
import { createMockLlmUpstream, sendJson } from '../helpers/mockLlmUpstream';

async function actor(role: UserRole = UserRole.USER) {
  const user = await createIntegrationTestUser({ role });
  const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(user.id);
  const token = jwt.sign({ id: user.id, role: user.role, status: user.status }, process.env.JWT_SECRET as string);
  return { user, workspace, headers: {
    Authorization: `Bearer ${token}`, 'X-Workspace-Id': String(workspace.id), 'Content-Type': 'application/json',
  } };
}

async function serve(app: ReturnType<typeof createApp>) {
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

beforeEach(resetIntegrationDatabase);

describe('composed production paths', () => {
  it('preserves owner isolation, provider generation, SSE and privacy-safe analytics', async () => {
    const api = createApiComposition();
    const server = await serve(createApp(api));
    const upstream = await createMockLlmUpstream({
      'GET /models': (_req, res) => sendJson(res, 200, { data: [{ id: 'composed-model' }] }),
      'POST /chat/completions': (req, res) => {
        if (JSON.parse(req.body).stream) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'private answer' }, finish_reason: 'stop' }] })}\n\n`);
          res.end('data: [DONE]\n\n');
        } else {
          sendJson(res, 200, { model: 'composed-model', choices: [{ message: { content: 'private answer' }, finish_reason: 'stop' }] });
        }
      },
    });
    try {
      const owner = await actor();
      const other = await actor();
      const admin = await actor(UserRole.ADMIN);
      const provider = await integrationPrisma.llmProviderConfig.create({ data: {
        name: 'Composed provider', type: 'OPENAI_COMPATIBLE', enabled: true,
        baseUrl: upstream.baseUrl, defaultModel: 'composed-model', apiKey: 'private-key',
      } });
      const created = await fetch(`${server.baseUrl}/api/chat`, {
        method: 'POST', headers: owner.headers, body: JSON.stringify({ title: 'private title' }),
      });
      expect(created.status).toBe(201);
      const session = (await created.json()).data;
      const body = JSON.stringify({ content: 'private prompt', providerId: provider.id });
      const generated = await fetch(`${server.baseUrl}/api/chat/${session.id}/generate`, {
        method: 'POST', headers: owner.headers, body,
      });
      expect(generated.status).toBe(201);
      expect(JSON.stringify(await generated.json())).toContain('private answer');
      const streamed = await fetch(`${server.baseUrl}/api/chat/${session.id}/generate/stream`, {
        method: 'POST', headers: owner.headers, body,
      });
      const events = await streamed.text();
      expect(streamed.status).toBe(200);
      expect(events).toContain('event: assistant_message');
      expect(events).toContain('event: done');
      for (const headers of [other.headers, admin.headers, { ...owner.headers, 'X-Workspace-Id': String(other.workspace.id) }]) {
        const denied = await fetch(`${server.baseUrl}/api/chat/${session.id}/messages`, { headers });
        expect(denied.status).toBe(404);
        expect(await denied.text()).not.toContain('private');
      }
      const missingContext = await fetch(`${server.baseUrl}/api/llm/models`, {
        headers: { Authorization: owner.headers.Authorization },
      });
      expect(missingContext.status).toBe(404);
      const models = await fetch(`${server.baseUrl}/api/llm/models`, { headers: owner.headers });
      expect(models.status).toBe(200);
      expect(JSON.stringify(await models.json())).not.toContain('private-key');
      const summaryResponse = await fetch(`${server.baseUrl}/api/admin/analytics/summary`, { headers: admin.headers });
      expect(summaryResponse.status).toBe(200);
      const summary = await summaryResponse.json();
      expect(summary.data.generation.total).toBe(2);
      expect(JSON.stringify(summary)).not.toMatch(/private (prompt|answer|title)|private-key/);
      expect(await integrationPrisma.generationUsage.count()).toBe(2);
      expect(await integrationPrisma.providerHealthSample.count()).toBeGreaterThan(0);
    } finally {
      await server.close();
      await api.stop();
      await upstream.close();
    }
  });

  it('runs validation and provider sampling through the composed API, worker and Piscina lifecycle', async () => {
    const upstream = await createMockLlmUpstream({
      'GET /models': (_req, res) => sendJson(res, 200, { data: [{ id: 'worker-model' }] }),
    });
    const api = createApiComposition();
    const worker = createWorkerComposition();
    const server = await serve(createApp(api));
    try {
      const admin = await actor(UserRole.ADMIN);
      await integrationPrisma.llmProviderConfig.create({ data: {
        name: 'Worker provider', type: 'OPENAI_COMPATIBLE', enabled: true,
        baseUrl: upstream.baseUrl, defaultModel: 'worker-model',
      } });
      await api.start();
      await worker.start();
      const enqueued = await fetch(`${server.baseUrl}/api/admin/system/validation-jobs`, {
        method: 'POST', headers: admin.headers, body: JSON.stringify({ mode: 'success' }),
      });
      expect(enqueued.status).toBe(202);
      const publicJob = (await enqueued.json()).data;
      expect(publicJob).not.toHaveProperty('payload');
      expect(publicJob).not.toHaveProperty('queueMessageId');
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const job = await integrationPrisma.job.findUniqueOrThrow({ where: { id: publicJob.id } });
        if (job.status === JobStatus.SUCCEEDED) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const job = await integrationPrisma.job.findUniqueOrThrow({ where: { id: publicJob.id } });
      expect(job.status).toBe(JobStatus.SUCCEEDED);
      expect(job.result).toMatchObject({ checksum: expect.any(String), iterations: 25000 });
      expect(await integrationPrisma.jobMetric.findUnique({ where: { jobId: job.id } })).toMatchObject({ outcome: 'SUCCEEDED' });
      const stream = await fetch(`${server.baseUrl}/api/jobs/${job.id}/stream`, { headers: admin.headers });
      expect(await stream.text()).toContain('event: succeeded');
      expect(await integrationPrisma.providerHealthSample.count()).toBeGreaterThan(0);
    } finally {
      await server.close();
      await worker.stop();
      await api.stop();
      await upstream.close();
    }
  }, 30000);
});
