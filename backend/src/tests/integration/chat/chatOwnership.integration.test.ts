import { MessageAuthor } from '@prisma/client';
import { NotFoundError } from '../../../errors';
import { ChatService } from '../../../modules/chat/chat.service';
import { WorkspaceService } from '../../../modules/workspace/workspace.service';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import {
  createIntegrationChatMessage,
  createIntegrationChatSession,
  createIntegrationTestUser,
  integrationPrisma,
  resetIntegrationDatabase,
} from '../helpers/prisma';

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('Chat ownership integration', () => {
  it('stores and returns a chat session workspaceId when provided', async () => {
    const owner = await createIntegrationTestUser({ email: 'workspace-chat-owner@example.com' });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);

    const session = await ChatService.createSession({
      title: 'Workspace Chat',
      userId: owner.id,
      workspaceId: workspace.id,
    });

    expect(session).toMatchObject({
      title: 'Workspace Chat',
      userId: owner.id,
      workspaceId: workspace.id,
    });

    await expect(
      integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({
      workspaceId: workspace.id,
    });
  });

  it('isolates sessions across workspaces owned by the same user', async () => {
    const owner = await createIntegrationTestUser({ email: 'same-owner-workspaces@example.com' });
    const { workspace: personalWorkspace } =
      await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const standardWorkspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: owner.id,
      name: 'Standard Chat Workspace',
    });
    const session = await createIntegrationChatSession(owner.id, {
      workspace: {
        connect: { id: standardWorkspace.id },
      },
    });

    await expect(ChatService.getSessionById(session.id, personalWorkspace.id)).rejects.toThrow(
      new NotFoundError('Session not found'),
    );
    await expect(ChatService.getSessionById(session.id, standardWorkspace.id)).resolves.toMatchObject({
      id: session.id,
      workspaceId: standardWorkspace.id,
    });
  });

  it('prevents one workspace context from reading, updating, deleting, or appending to another workspace session', async () => {
    const owner = await createIntegrationTestUser({ email: 'session-owner@example.com' });
    const otherUser = await createIntegrationTestUser({ email: 'session-intruder@example.com' });
    const { workspace: ownerWorkspace } =
      await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const { workspace: otherWorkspace } =
      await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(otherUser.id);
    const session = await createIntegrationChatSession(owner.id, {
      workspace: {
        connect: { id: ownerWorkspace.id },
      },
    });

    await expect(ChatService.getSessionById(session.id, otherWorkspace.id)).rejects.toThrow(
      new NotFoundError('Session not found'),
    );
    await expect(
      ChatService.updateSession(session.id, otherWorkspace.id, { title: 'Intruder title' }),
    ).rejects.toThrow(new NotFoundError('Session not found'));
    await expect(ChatService.deleteSession(session.id, otherWorkspace.id)).rejects.toThrow(
      new NotFoundError('Session not found'),
    );
    await expect(
      ChatService.createMessage(
        {
          sessionId: session.id,
          content: 'Unauthorized append',
          author: MessageAuthor.USER,
        },
        otherWorkspace.id,
      ),
    ).rejects.toThrow(new NotFoundError('Session not found'));

    await expect(integrationPrisma.chatSession.findUnique({ where: { id: session.id } })).resolves.toMatchObject({
      title: 'Integration Test Chat',
      userId: owner.id,
      workspaceId: ownerWorkspace.id,
    });
    await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
  });

  it('cascades messages when a chat session is deleted in the real database', async () => {
    const owner = await createIntegrationTestUser({ email: 'cascade-owner@example.com' });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const session = await createIntegrationChatSession(owner.id, {
      workspace: {
        connect: { id: workspace.id },
      },
    });
    await createIntegrationChatMessage(session.id, {
      content: 'Message to cascade',
      author: MessageAuthor.USER,
    });

    await ChatService.deleteSession(session.id, workspace.id);

    await expect(integrationPrisma.chatSession.count()).resolves.toBe(0);
    await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
  });
});
