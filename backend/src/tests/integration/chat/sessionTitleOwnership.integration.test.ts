import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ChatSessionTitleSource } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createApp } from '../../../app';
import { ChatRepository } from '../../../modules/chat/chat.repository';
import { ChatService } from '../../../modules/chat/chat.service';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const listener = createApp().listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(resetIntegrationDatabase);

async function createActor() {
  const user = await createIntegrationTestUser();
  const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(user.id);
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string);
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Workspace-Id': String(workspace.id),
    'Content-Type': 'application/json',
  };
  return { user, workspace, headers };
}

async function requestChat(
  method: 'POST' | 'PUT' | 'GET',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  const response = await fetch(`${baseUrl}/api/chat${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

describe('session title ownership', () => {
  it('distinguishes omitted, supplied, and explicit New Chat titles without exposing titleSource', async () => {
    const { headers } = await createActor();
    const omitted = await requestChat('POST', '/', headers);
    const named = await requestChat('POST', '/', headers, { title: '  My notes  ' });
    const explicitDefault = await requestChat('POST', '/', headers, { title: 'New Chat' });

    expect([omitted.status, named.status, explicitDefault.status]).toEqual([201, 201, 201]);
    expect(omitted.body.data.title).toBe('New Chat');
    expect(named.body.data.title).toBe('My notes');
    expect(explicitDefault.body.data.title).toBe('New Chat');
    for (const result of [omitted, named, explicitDefault]) {
      expect(result.body.data).not.toHaveProperty('titleSource');
    }
    const sessions = await integrationPrisma.chatSession.findMany({ orderBy: { id: 'asc' } });
    expect(sessions.map(({ titleSource }) => titleSource)).toEqual([
      ChatSessionTitleSource.PLACEHOLDER,
      ChatSessionTitleSource.USER,
      ChatSessionTitleSource.USER,
    ]);
  });

  it.each([null, '', '   ', 42, false, { text: 'title' }])(
    'rejects an invalid supplied title: %p', async (title) => {
      const { headers } = await createActor();
      const result = await requestChat('POST', '/', headers, { title });
      expect(result.status).toBe(400);
      expect(await integrationPrisma.chatSession.count()).toBe(0);
    },
  );

  it('treats a same-text API rename as user ownership and ignores forged internal fields', async () => {
    const { headers } = await createActor();
    const created = await requestChat('POST', '/', headers, {});
    const id = created.body.data.id as number;
    const renamed = await requestChat('PUT', `/${id}`, headers, {
      title: 'New Chat',
      titleSource: ChatSessionTitleSource.GENERATED,
    });

    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({ id, title: 'New Chat' });
    expect(renamed.body.data).not.toHaveProperty('titleSource');
    expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id } })).titleSource)
      .toBe(ChatSessionTitleSource.USER);
    await expect(ChatRepository.applyGeneratedTitleInWorkspace(id, created.body.data.workspaceId, 'Automatic'))
      .resolves.toBe(false);
    const detail = await requestChat('GET', `/${id}`, headers);
    expect(detail.body.data).not.toHaveProperty('titleSource');
  });

  it('keeps an empty or internal-field-only update as a no-op', async () => {
    const { headers } = await createActor();
    const created = await requestChat('POST', '/', headers, {});
    const id = created.body.data.id as number;

    expect((await requestChat('PUT', `/${id}`, headers, {})).status).toBe(200);
    expect((await requestChat('PUT', `/${id}`, headers, {
      titleSource: ChatSessionTitleSource.USER,
    })).status).toBe(200);
    expect(await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id } }))
      .toMatchObject({ title: 'New Chat', titleSource: ChatSessionTitleSource.PLACEHOLDER });
  });

  it('persists a generated title only for a placeholder in its workspace', async () => {
    const { user, workspace, headers } = await createActor();
    const otherWorkspace = await integrationPrisma.workspace.create({
      data: { name: 'Other workspace', type: 'STANDARD', ownerUserId: user.id },
    });
    const created = await requestChat('POST', '/', headers, {});
    const id = created.body.data.id as number;

    await expect(ChatRepository.applyGeneratedTitleInWorkspace(id, otherWorkspace.id, 'Wrong workspace'))
      .resolves.toBe(false);
    await expect(ChatRepository.applyGeneratedTitleInWorkspace(id, workspace.id, 'Useful title'))
      .resolves.toBe(true);
    await expect(ChatRepository.applyGeneratedTitleInWorkspace(id, workspace.id, 'Second title'))
      .resolves.toBe(false);
    expect(await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id } }))
      .toMatchObject({ title: 'Useful title', titleSource: ChatSessionTitleSource.GENERATED });
    const detail = await requestChat('GET', `/${id}`, headers);
    expect(detail.body.data.title).toBe('Useful title');
    expect(detail.body.data).not.toHaveProperty('titleSource');

    await integrationPrisma.chatSession.delete({ where: { id } });
    await expect(ChatRepository.applyGeneratedTitleInWorkspace(id, workspace.id, 'Too late'))
      .resolves.toBe(false);
  });

  it('preserves manual naming when rename and conditional generation race', async () => {
    const { user, workspace, headers } = await createActor();
    const context = {
      workspace,
      actor: { userId: user.id, role: user.role },
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const created = await requestChat('POST', '/', headers, {});
      const id = created.body.data.id as number;
      await Promise.all([
        ChatRepository.applyGeneratedTitleInWorkspace(id, workspace.id, 'Automatic title'),
        ChatService.updateSession(id, { title: 'My title' }, context),
      ]);

      expect(await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id } }))
        .toMatchObject({ title: 'My title', titleSource: ChatSessionTitleSource.USER });
    }
  });
});
