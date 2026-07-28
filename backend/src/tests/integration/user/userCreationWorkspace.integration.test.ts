import { WorkspaceMembershipRole, WorkspaceMembershipStatus, WorkspaceType } from '@prisma/client';
import { UserService } from '../../../modules/user/user.service';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('User creation workspace provisioning integration', () => {
  it('creates a personal workspace and sole active owner membership with the user', async () => {
    const user = await UserService.createUser({
      email: 'created-with-workspace@example.com',
      name: 'Created With Workspace',
      password: 'Password123!',
    });

    const workspace = await integrationPrisma.workspace.findFirstOrThrow({
      where: {
        ownerUserId: user.id,
        type: WorkspaceType.PERSONAL,
      },
      include: {
        memberships: true,
      },
    });

    expect(workspace.memberships).toHaveLength(1);
    expect(workspace.memberships[0]).toMatchObject({
      userId: user.id,
      role: WorkspaceMembershipRole.OWNER,
      status: WorkspaceMembershipStatus.ACTIVE,
    });
    await expect(
      integrationPrisma.workspace.count({
        where: {
          ownerUserId: user.id,
          type: WorkspaceType.PERSONAL,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back user creation when personal workspace provisioning fails', async () => {
    const provisioningError = new Error('forced provisioning failure');
    const provisioningSpy = jest
      .spyOn(WorkspaceProvisioningService, 'ensurePersonalWorkspaceForUser')
      .mockRejectedValueOnce(provisioningError);

    try {
      await expect(
        UserService.createUser({
          email: 'rollback-user@example.com',
          name: 'Rollback User',
          password: 'Password123!',
        }),
      ).rejects.toThrow(provisioningError);
    } finally {
      provisioningSpy.mockRestore();
    }

    await expect(
      integrationPrisma.user.findUnique({ where: { email: 'rollback-user@example.com' } }),
    ).resolves.toBeNull();
    await expect(integrationPrisma.workspace.count()).resolves.toBe(0);
  });
});
