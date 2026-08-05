import {
  MessageAuthor,
  UserRole,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import jwt from 'jsonwebtoken';
import { NotFoundError } from '../../../errors';
import { authenticate } from '../../../middleware';
import { ChatService } from '../../../modules/chat/chat.service';
import { IChatWorkspaceContext } from '../../../modules/chat/chat.types';
import { WorkspaceService } from '../../../modules/workspace/workspace.service';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { AuthenticatedRequest } from '../../../types/authenticatedRequest';
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

function signToken(user: {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  status: string;
}) {
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

function createAuthenticatedRequest(token: string, workspaceId: number): AuthenticatedRequest {
  return ({
    headers: {
      authorization: `Bearer ${token}`,
      'x-workspace-id': String(workspaceId),
    },
  } as unknown) as AuthenticatedRequest;
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

  it('rejects same-owner cross-workspace session, message, and generation preparation operations', async () => {
    const owner = await createIntegrationTestUser({ email: 'same-owner-cross-workspace@example.com' });
    const { workspace: personalWorkspace } =
      await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const standardWorkspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: owner.id,
      name: 'Isolated Project Workspace',
    });
    const standardSession = await createIntegrationChatSession(owner.id, {
      workspace: {
        connect: { id: standardWorkspace.id },
      },
    });
    await createIntegrationChatMessage(standardSession.id, {
      content: 'Project-only message',
      author: MessageAuthor.USER,
    });

    const personalContext = createChatWorkspaceContext({
      workspace: personalWorkspace,
      actorUserId: owner.id,
    });

    await expect(
      ChatService.getSessionById(standardSession.id, personalContext),
    ).rejects.toThrow(new NotFoundError('Session not found'));
    await expect(
      ChatService.updateSession(
        standardSession.id,
        { title: 'Wrong Workspace Update' },
        personalContext,
      ),
    ).rejects.toThrow(new NotFoundError('Session not found'));
    await expect(
      ChatService.getMessagesBySessionId(standardSession.id, personalContext),
    ).rejects.toThrow(new NotFoundError('Session not found'));
    await expect(
      ChatService.createMessage(
        {
          sessionId: standardSession.id,
          content: 'Wrong workspace append',
          author: MessageAuthor.USER,
        },
        personalContext,
      ),
    ).rejects.toThrow(new NotFoundError('Session not found'));
    await expect(
      ChatService.prepareGeneration(
        {
          sessionId: standardSession.id,
          content: 'Wrong workspace generation',
        },
        personalContext,
      ),
    ).rejects.toThrow(new NotFoundError('Session not found'));
    await expect(
      ChatService.deleteSession(standardSession.id, personalContext),
    ).rejects.toThrow(new NotFoundError('Session not found'));

    await expect(
      ChatService.getSessionById(
        standardSession.id,
        createChatWorkspaceContext({
          workspace: standardWorkspace,
          actorUserId: owner.id,
        }),
      ),
    ).resolves.toMatchObject({
      id: standardSession.id,
      workspaceId: standardWorkspace.id,
      messages: [expect.objectContaining({ content: 'Project-only message' })],
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

  it('rejects generation preparation when a non-owner membership row targets the session workspace', async () => {
    const owner = await createIntegrationTestUser({ email: 'membership-generation-owner@example.com' });
    const invitedUser = await createIntegrationTestUser({ email: 'membership-generation-non-owner@example.com' });
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
        role: WorkspaceMembershipRole.VIEWER,
        status: WorkspaceMembershipStatus.ACTIVE,
      },
    });

    await expect(
      ChatService.prepareGeneration(
        {
          sessionId: session.id,
          content: 'Membership should not grant generation access',
        },
        createChatWorkspaceContext({ workspace, actorUserId: invitedUser.id }),
      ),
    ).rejects.toThrow(new NotFoundError('Workspace not found'));
    await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
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

  it('does not let a global admin role prepare generation in another user workspace', async () => {
    const owner = await createIntegrationTestUser({ email: 'admin-generation-denial-owner@example.com' });
    const admin = await createIntegrationTestUser({
      email: 'admin-generation-denial-admin@example.com',
      role: UserRole.ADMIN,
    });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const session = await createIntegrationChatSession(owner.id, {
      workspace: {
        connect: { id: workspace.id },
      },
    });

    await expect(
      ChatService.prepareGeneration(
        {
          sessionId: session.id,
          content: 'Admin role should not grant workspace content access',
        },
        createChatWorkspaceContext({
          workspace,
          actorUserId: admin.id,
          actorRole: UserRole.ADMIN,
        }),
      ),
    ).rejects.toThrow(new NotFoundError('Workspace not found'));
    await expect(integrationPrisma.chatMessage.count()).resolves.toBe(0);
  });

  it('rejects selecting a soft-deleted standard workspace as request context', async () => {
    const owner = await createIntegrationTestUser({ email: 'deleted-standard-owner@example.com' });
    await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const standardWorkspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: owner.id,
      name: 'Temporary Workspace',
    });
    await createIntegrationChatSession(owner.id, {
      workspace: {
        connect: { id: standardWorkspace.id },
      },
    });

    await WorkspaceService.deleteWorkspace(standardWorkspace.id, owner.id, owner.role);

    const req = createAuthenticatedRequest(signToken(owner), standardWorkspace.id);

    await expect(authenticate(req, {} as never, jest.fn())).rejects.toThrow(
      new NotFoundError('Workspace not found'),
    );
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
