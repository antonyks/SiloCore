import {
  Prisma,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('Workspace schema integration', () => {
  it('creates workspace and membership rows with the forward-compatible enums', async () => {
    const owner = await createIntegrationTestUser({ email: 'workspace-owner@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Personal Workspace',
        type: WorkspaceType.PERSONAL,
        ownerUserId: owner.id,
      },
    });

    const membership = await integrationPrisma.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: owner.id,
        role: WorkspaceMembershipRole.OWNER,
      },
    });

    expect(workspace).toMatchObject({
      id: 1,
      name: 'Personal Workspace',
      type: WorkspaceType.PERSONAL,
      status: WorkspaceStatus.ACTIVE,
      ownerUserId: owner.id,
    });
    expect(membership).toMatchObject({
      workspaceId: workspace.id,
      userId: owner.id,
      role: WorkspaceMembershipRole.OWNER,
      status: WorkspaceMembershipStatus.ACTIVE,
    });
  });

  it('allows a user to own multiple standard workspaces', async () => {
    const owner = await createIntegrationTestUser({ email: 'standard-owner@example.com' });

    await integrationPrisma.workspace.createMany({
      data: [
        {
          name: 'Standard One',
          type: WorkspaceType.STANDARD,
          ownerUserId: owner.id,
          updatedAt: new Date(),
        },
        {
          name: 'Standard Two',
          type: WorkspaceType.STANDARD,
          ownerUserId: owner.id,
          updatedAt: new Date(),
        },
      ],
    });

    await expect(integrationPrisma.workspace.count()).resolves.toBe(2);
  });

  it('rejects more than one personal workspace for the same owner', async () => {
    const owner = await createIntegrationTestUser({ email: 'personal-owner@example.com' });

    await integrationPrisma.workspace.create({
      data: {
        name: 'Primary Personal',
        type: WorkspaceType.PERSONAL,
        ownerUserId: owner.id,
      },
    });

    await expect(
      integrationPrisma.workspace.create({
        data: {
          name: 'Second Personal',
          type: WorkspaceType.PERSONAL,
          ownerUserId: owner.id,
        },
      }),
    ).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({
      code: 'P2002',
    });
  });

  it('rejects more than one active owner membership for a workspace', async () => {
    const owner = await createIntegrationTestUser({ email: 'owner-member@example.com' });
    const secondOwner = await createIntegrationTestUser({ email: 'second-owner-member@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Owner Membership Workspace',
        type: WorkspaceType.STANDARD,
        ownerUserId: owner.id,
      },
    });

    await integrationPrisma.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: owner.id,
        role: WorkspaceMembershipRole.OWNER,
      },
    });

    await expect(
      integrationPrisma.workspaceMembership.create({
        data: {
          workspaceId: workspace.id,
          userId: secondOwner.id,
          role: WorkspaceMembershipRole.OWNER,
        },
      }),
    ).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({
      code: 'P2002',
    });
  });

  it('rejects duplicate membership rows for the same workspace and user', async () => {
    const owner = await createIntegrationTestUser({ email: 'duplicate-member-owner@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Duplicate Membership Workspace',
        type: WorkspaceType.STANDARD,
        ownerUserId: owner.id,
      },
    });

    await integrationPrisma.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: owner.id,
        role: WorkspaceMembershipRole.VIEWER,
      },
    });

    await expect(
      integrationPrisma.workspaceMembership.create({
        data: {
          workspaceId: workspace.id,
          userId: owner.id,
          role: WorkspaceMembershipRole.EDITOR,
          status: WorkspaceMembershipStatus.INACTIVE,
        },
      }),
    ).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({
      code: 'P2002',
    });
  });

  it('stores editor and viewer membership values without activating Core sharing behavior', async () => {
    const owner = await createIntegrationTestUser({ email: 'forward-owner@example.com' });
    const editor = await createIntegrationTestUser({ email: 'forward-editor@example.com' });
    const viewer = await createIntegrationTestUser({ email: 'forward-viewer@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Forward Compatible Workspace',
        type: WorkspaceType.STANDARD,
        ownerUserId: owner.id,
      },
    });

    await integrationPrisma.workspaceMembership.createMany({
      data: [
        {
          workspaceId: workspace.id,
          userId: editor.id,
          role: WorkspaceMembershipRole.EDITOR,
          status: WorkspaceMembershipStatus.INACTIVE,
          updatedAt: new Date(),
        },
        {
          workspaceId: workspace.id,
          userId: viewer.id,
          role: WorkspaceMembershipRole.VIEWER,
          status: WorkspaceMembershipStatus.INACTIVE,
          updatedAt: new Date(),
        },
      ],
    });

    await expect(integrationPrisma.workspaceMembership.count()).resolves.toBe(2);
  });
});
