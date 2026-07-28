import {
  UserRole,
  UserStatus,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('WorkspaceProvisioningService integration', () => {
  it('backfills personal workspaces and owner memberships for every user status', async () => {
    const regular = await createIntegrationTestUser({ email: 'regular-workspace@example.com' });
    const admin = await createIntegrationTestUser({
      email: 'admin-workspace@example.com',
      role: UserRole.ADMIN,
    });
    const banned = await createIntegrationTestUser({
      email: 'banned-workspace@example.com',
      status: UserStatus.BANNED,
    });
    const deleted = await createIntegrationTestUser({
      email: 'deleted-workspace@example.com',
      status: UserStatus.DELETED,
    });

    const result = await WorkspaceProvisioningService.backfillPersonalWorkspaces(integrationPrisma);

    expect(result).toEqual({
      usersProcessed: 4,
      workspacesCreated: 4,
      workspacesUpdated: 0,
      membershipsCreated: 4,
      membershipsUpdated: 0,
    });

    for (const user of [regular, admin, banned, deleted]) {
      const workspace = await integrationPrisma.workspace.findFirstOrThrow({
        where: {
          ownerUserId: user.id,
          type: WorkspaceType.PERSONAL,
        },
        include: { memberships: true },
      });

      expect(workspace.memberships).toHaveLength(1);
      expect(workspace.memberships[0]).toMatchObject({
        userId: user.id,
        role: WorkspaceMembershipRole.OWNER,
        status: WorkspaceMembershipStatus.ACTIVE,
      });
    }
  });

  it('can rerun without creating duplicate workspaces or memberships', async () => {
    const user = await createIntegrationTestUser({ email: 'idempotent-workspace@example.com' });

    await WorkspaceProvisioningService.backfillPersonalWorkspaces(integrationPrisma);
    const secondRun = await WorkspaceProvisioningService.backfillPersonalWorkspaces(integrationPrisma);

    await expect(
      integrationPrisma.workspace.count({
        where: {
          ownerUserId: user.id,
          type: WorkspaceType.PERSONAL,
        },
      }),
    ).resolves.toBe(1);
    await expect(integrationPrisma.workspaceMembership.count()).resolves.toBe(1);
    expect(secondRun).toEqual({
      usersProcessed: 1,
      workspacesCreated: 0,
      workspacesUpdated: 0,
      membershipsCreated: 0,
      membershipsUpdated: 0,
    });
  });

  it('reuses an existing personal workspace and creates a missing owner membership', async () => {
    const user = await createIntegrationTestUser({ email: 'existing-workspace@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Existing Personal',
        type: WorkspaceType.PERSONAL,
        ownerUserId: user.id,
      },
    });

    const result = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(
      user.id,
      integrationPrisma,
    );

    expect(result.workspace.id).toBe(workspace.id);
    expect(result).toMatchObject({
      workspaceCreated: false,
      workspaceUpdated: false,
      membershipCreated: true,
      membershipUpdated: false,
    });
    expect(result.ownerMembership).toMatchObject({
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceMembershipRole.OWNER,
      status: WorkspaceMembershipStatus.ACTIVE,
    });
  });

  it('repairs an existing owner user membership to active OWNER', async () => {
    const user = await createIntegrationTestUser({ email: 'repair-workspace@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Repair Personal',
        type: WorkspaceType.PERSONAL,
        ownerUserId: user.id,
      },
    });
    const membership = await integrationPrisma.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: WorkspaceMembershipRole.VIEWER,
        status: WorkspaceMembershipStatus.INACTIVE,
      },
    });

    const result = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(
      user.id,
      integrationPrisma,
    );

    expect(result).toMatchObject({
      workspaceCreated: false,
      workspaceUpdated: false,
      membershipCreated: false,
      membershipUpdated: true,
    });
    await expect(
      integrationPrisma.workspaceMembership.findUniqueOrThrow({ where: { id: membership.id } }),
    ).resolves.toMatchObject({
      role: WorkspaceMembershipRole.OWNER,
      status: WorkspaceMembershipStatus.ACTIVE,
    });
  });

  it('reactivates an existing deleted personal workspace', async () => {
    const user = await createIntegrationTestUser({ email: 'deleted-personal@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Deleted Personal',
        type: WorkspaceType.PERSONAL,
        status: WorkspaceStatus.DELETED,
        ownerUserId: user.id,
      },
    });

    const result = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(
      user.id,
      integrationPrisma,
    );

    expect(result).toMatchObject({
      workspaceCreated: false,
      workspaceUpdated: true,
      membershipCreated: true,
      membershipUpdated: false,
    });
    await expect(
      integrationPrisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } }),
    ).resolves.toMatchObject({
      status: WorkspaceStatus.ACTIVE,
    });
  });

  it('rejects personal workspace data when an active owner membership belongs to another user', async () => {
    const canonicalOwner = await createIntegrationTestUser({
      email: 'canonical-owner@example.com',
    });
    const conflictingOwner = await createIntegrationTestUser({
      email: 'conflicting-owner@example.com',
    });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Conflicting Personal',
        type: WorkspaceType.PERSONAL,
        ownerUserId: canonicalOwner.id,
      },
    });

    await integrationPrisma.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: conflictingOwner.id,
        role: WorkspaceMembershipRole.OWNER,
      },
    });

    await expect(
      WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(
        canonicalOwner.id,
        integrationPrisma,
      ),
    ).rejects.toThrow(
      `Workspace ${workspace.id} has an active OWNER membership for user ${conflictingOwner.id}, not canonical owner ${canonicalOwner.id}.`,
    );
  });
});
