import {
  MessageAuthor,
  UserRole,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { NotFoundError } from '../../../errors';
import { ChatService } from '../../../modules/chat/chat.service';
import { IChatWorkspaceContext } from '../../../modules/chat/chat.types';
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

describe('Chat ownership integration', () => {
  it('rejects creating a chat session without a workspaceId at the database layer', async () => {
    const owner = await createIntegrationTestUser({ email: 'missing-workspace-chat-owner@example.com' });

    await expect(
      integrationPrisma.$executeRaw`
        INSERT INTO "chat_sessions" ("title", "userId", "createdAt", "updatedAt")
        VALUES ('Missing Workspace', ${owner.id}, NOW(), NOW())
      `,
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: expect.objectContaining({
        code: '23502',
      }),
    });
  });

  it('stores and returns a chat session workspaceId when provided', async () => {
    const owner = await createIntegrationTestUser({ email: 'workspace-chat-owner@example.com' });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);

    const session = await ChatService.createSession({
      title: 'Workspace Chat',
      userId: owner.id,
    }, createChatWorkspaceContext({
      workspace,
      actorUserId: owner.id,
    }));

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

    await expect(ChatService.getSessionById(
      session.id,
      createChatWorkspaceContext({ workspace: personalWorkspace, actorUserId: owner.id }),
    )).rejects.toThrow(
      new NotFoundError('Session not found'),
    );
    await expect(ChatService.getSessionById(
      session.id,
      createChatWorkspaceContext({ workspace: standardWorkspace, actorUserId: owner.id }),
    )).resolves.toMatchObject({
      id: session.id,
      workspaceId: standardWorkspace.id,
    });
  });

  it('lets an owner use chat independently across personal and standard workspaces', async () => {
    const owner = await createIntegrationTestUser({ email: 'multi-workspace-owner@example.com' });
    const { workspace: personalWorkspace } =
      await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const standardWorkspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: owner.id,
      name: 'Project Workspace',
    });

    const personalSession = await ChatService.createSession(
      {
        title: 'Personal Chat',
        userId: owner.id,
      },
      createChatWorkspaceContext({ workspace: personalWorkspace, actorUserId: owner.id }),
    );
    const standardSession = await ChatService.createSession(
      {
        title: 'Standard Chat',
        userId: owner.id,
      },
      createChatWorkspaceContext({ workspace: standardWorkspace, actorUserId: owner.id }),
    );

    await expect(
      ChatService.getWorkspaceSessions(
        {},
        createChatWorkspaceContext({ workspace: personalWorkspace, actorUserId: owner.id }),
      ),
    ).resolves.toMatchObject([{ id: personalSession.id, workspaceId: personalWorkspace.id }]);
    await expect(
      ChatService.getWorkspaceSessions(
        {},
        createChatWorkspaceContext({ workspace: standardWorkspace, actorUserId: owner.id }),
      ),
    ).resolves.toMatchObject([{ id: standardSession.id, workspaceId: standardWorkspace.id }]);
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

    await expect(ChatService.getSessionById(
      session.id,
      createChatWorkspaceContext({ workspace: otherWorkspace, actorUserId: otherUser.id }),
    )).rejects.toThrow(
      new NotFoundError('Session not found'),
    );
    await expect(
      ChatService.updateSession(
        session.id,
        { title: 'Intruder title' },
        createChatWorkspaceContext({ workspace: otherWorkspace, actorUserId: otherUser.id }),
      ),
    ).rejects.toThrow(new NotFoundError('Session not found'));
    await expect(ChatService.deleteSession(
      session.id,
      createChatWorkspaceContext({ workspace: otherWorkspace, actorUserId: otherUser.id }),
    )).rejects.toThrow(
      new NotFoundError('Session not found'),
    );
    await expect(
      ChatService.createMessage(
        {
          sessionId: session.id,
          content: 'Unauthorized append',
          author: MessageAuthor.USER,
        },
        createChatWorkspaceContext({ workspace: otherWorkspace, actorUserId: otherUser.id }),
      ),
    ).rejects.toThrow(new NotFoundError('Session not found'));

    await expect(integrationPrisma.chatSession.findUnique({ where: { id: session.id } })).resolves.toMatchObject({
      title: 'Integration Test Chat',
      userId: owner.id,
      workspaceId: ownerWorkspace.id,
    });
    await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
  });

  it('does not grant chat access from an extra non-owner membership row', async () => {
    const owner = await createIntegrationTestUser({ email: 'membership-owner@example.com' });
    const invitedUser = await createIntegrationTestUser({ email: 'membership-non-owner@example.com' });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const session = await createIntegrationChatSession(owner.id, {
      workspace: {
        connect: { id: workspace.id },
      },
    });

    await integrationPrisma.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: invitedUser.id,
        role: WorkspaceMembershipRole.EDITOR,
        status: WorkspaceMembershipStatus.ACTIVE,
      },
    });

    await expect(
      ChatService.getSessionById(
        session.id,
        createChatWorkspaceContext({ workspace, actorUserId: invitedUser.id }),
      ),
    ).rejects.toThrow(new NotFoundError('Workspace not found'));
    await expect(
      ChatService.createMessage(
        {
          sessionId: session.id,
          content: 'Membership should not grant access',
          author: MessageAuthor.USER,
        },
        createChatWorkspaceContext({ workspace, actorUserId: invitedUser.id }),
      ),
    ).rejects.toThrow(new NotFoundError('Workspace not found'));
  });

  it('does not let a global admin role read another user workspace chat', async () => {
    const owner = await createIntegrationTestUser({ email: 'admin-denial-owner@example.com' });
    const admin = await createIntegrationTestUser({
      email: 'admin-denial-admin@example.com',
      role: UserRole.ADMIN,
    });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const session = await createIntegrationChatSession(owner.id, {
      workspace: {
        connect: { id: workspace.id },
      },
    });

    await expect(
      ChatService.getSessionById(
        session.id,
        createChatWorkspaceContext({
          workspace,
          actorUserId: admin.id,
          actorRole: UserRole.ADMIN,
        }),
      ),
    ).rejects.toThrow(new NotFoundError('Workspace not found'));
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

    await ChatService.deleteSession(
      session.id,
      createChatWorkspaceContext({ workspace, actorUserId: owner.id }),
    );

    await expect(integrationPrisma.chatSession.count()).resolves.toBe(0);
    await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
  });
});
