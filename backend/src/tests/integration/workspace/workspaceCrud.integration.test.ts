import jwt from 'jsonwebtoken';
import {
  UserRole,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { InvalidInputError, NotFoundError } from '../../../errors';
import { authenticate } from '../../../middleware';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { WorkspaceService } from '../../../modules/workspace/workspace.service';
import { AuthenticatedRequest } from '../../../types/authenticatedRequest';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';

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

function createRequest(token: string, workspaceId: number): AuthenticatedRequest {
  return ({
    headers: {
      authorization: `Bearer ${token}`,
      'x-workspace-id': String(workspaceId),
    },
  } as unknown) as AuthenticatedRequest;
}

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('Workspace CRUD integration', () => {
  it('creates a standard workspace with the canonical owner membership', async () => {
    const user = await createIntegrationTestUser();
    await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(user.id);

    const workspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: user.id,
      name: 'Project Workspace',
    });

    expect(workspace).toMatchObject({
      name: 'Project Workspace',
      type: WorkspaceType.STANDARD,
      status: WorkspaceStatus.ACTIVE,
      ownerUserId: user.id,
    });

    const membership = await integrationPrisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
    });

    expect(membership).toMatchObject({
      role: WorkspaceMembershipRole.OWNER,
      status: WorkspaceMembershipStatus.ACTIVE,
    });
  });

  it('lists only the current user active workspaces', async () => {
    const owner = await createIntegrationTestUser();
    const otherUser = await createIntegrationTestUser();
    const { workspace: personalWorkspace } =
      await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(otherUser.id);
    const standardWorkspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: owner.id,
      name: 'Standard Workspace',
    });
    const deletedWorkspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: owner.id,
      name: 'Deleted Workspace',
    });
    await WorkspaceService.deleteWorkspace(deletedWorkspace.id, owner.id, owner.role);

    const workspaces = await WorkspaceService.listOwnedWorkspaces(owner.id);

    expect(workspaces.map((workspace) => workspace.id).sort((a, b) => a - b)).toEqual([
      personalWorkspace.id,
      standardWorkspace.id,
    ].sort((a, b) => a - b));
  });

  it('renames and soft-deletes an owned standard workspace', async () => {
    const owner = await createIntegrationTestUser();
    await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const workspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: owner.id,
      name: 'Old Name',
    });

    const renamed = await WorkspaceService.updateWorkspace(
      workspace.id,
      owner.id,
      { name: 'New Name' },
      owner.role,
    );
    const deleted = await WorkspaceService.deleteWorkspace(workspace.id, owner.id, owner.role);

    expect(renamed.name).toBe('New Name');
    expect(deleted.status).toBe(WorkspaceStatus.DELETED);

    const token = signToken(owner);
    const req = createRequest(token, workspace.id);

    await expect(authenticate(req, {} as never, jest.fn())).rejects.toThrow('Workspace not found');
  });

  it('rejects personal workspace mutation and cross-user access', async () => {
    const owner = await createIntegrationTestUser();
    const otherUser = await createIntegrationTestUser();
    const { workspace: personalWorkspace } =
      await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    const standardWorkspace = await WorkspaceService.createStandardWorkspace({
      ownerUserId: owner.id,
      name: 'Owner Workspace',
    });

    await expect(
      WorkspaceService.updateWorkspace(
        personalWorkspace.id,
        owner.id,
        { name: 'Renamed Personal' },
        owner.role,
      ),
    ).rejects.toThrow(InvalidInputError);
    await expect(
      WorkspaceService.deleteWorkspace(personalWorkspace.id, owner.id, owner.role),
    ).rejects.toThrow(InvalidInputError);
    await expect(
      WorkspaceService.updateWorkspace(
        standardWorkspace.id,
        otherUser.id,
        { name: 'Cross User' },
        otherUser.role,
      ),
    ).rejects.toThrow(new NotFoundError('Workspace not found'));
  });
});
