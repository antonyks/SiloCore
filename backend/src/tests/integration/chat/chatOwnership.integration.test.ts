import { MessageAuthor } from '@prisma/client';
import { AuthenticationError } from '../../../errors';
import { ChatService } from '../../../modules/chat/chat.service';
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

  it('prevents one user from reading, updating, deleting, or appending to another user session', async () => {
    const owner = await createIntegrationTestUser({ email: 'session-owner@example.com' });
    const otherUser = await createIntegrationTestUser({ email: 'session-intruder@example.com' });
    const session = await createIntegrationChatSession(owner.id);

    await expect(ChatService.getSessionById(session.id, otherUser.id)).rejects.toThrow(AuthenticationError);
    await expect(
      ChatService.updateSession(session.id, otherUser.id, { title: 'Intruder title' }),
    ).rejects.toThrow(AuthenticationError);
    await expect(ChatService.deleteSession(session.id, otherUser.id)).rejects.toThrow(AuthenticationError);
    await expect(
      ChatService.createMessage(
        {
          sessionId: session.id,
          content: 'Unauthorized append',
          author: MessageAuthor.USER,
        },
        otherUser.id,
      ),
    ).rejects.toThrow(AuthenticationError);

    await expect(integrationPrisma.chatSession.findUnique({ where: { id: session.id } })).resolves.toMatchObject({
      title: 'Integration Test Chat',
      userId: owner.id,
    });
    await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
  });

  it('cascades messages when a chat session is deleted in the real database', async () => {
    const owner = await createIntegrationTestUser({ email: 'cascade-owner@example.com' });
    const session = await createIntegrationChatSession(owner.id);
    await createIntegrationChatMessage(session.id, {
      content: 'Message to cascade',
      author: MessageAuthor.USER,
    });

    await ChatService.deleteSession(session.id, owner.id);

    await expect(integrationPrisma.chatSession.count()).resolves.toBe(0);
    await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
  });
});
