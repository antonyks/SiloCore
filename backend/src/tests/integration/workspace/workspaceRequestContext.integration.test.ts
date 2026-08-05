import jwt from 'jsonwebtoken';
import {
  UserRole,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { authenticate } from '../../../middleware';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';
import { AuthenticatedRequest } from '../../../types/authenticatedRequest';

function createRequest(token: string, workspaceId?: string): AuthenticatedRequest {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...(workspaceId === undefined ? {} : { 'x-workspace-id': workspaceId }),
    },
  } as AuthenticatedRequest;
}

function createResponse() {
  return {} as never;
}

function createNext() {
  return jest.fn();
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

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('Workspace request context integration', () => {
  it('attaches workspace context for an owned active workspace', async () => {
    const user = await createIntegrationTestUser();
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(user.id);
    const token = signToken(user);
    const req = createRequest(token, String(workspace.id));
    const next = createNext();

    await authenticate(req, createResponse(), next);

    expect(req.workspace).toMatchObject({
      id: workspace.id,
      ownerUserId: user.id,
      type: WorkspaceType.PERSONAL,
      status: WorkspaceStatus.ACTIVE,
    });
    expect(req.workspaceActor).toEqual({
      userId: user.id,
      role: user.role,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing header', undefined],
    ['malformed header', 'abc'],
    ['zero header', '0'],
    ['unknown workspace', '999999'],
  ])('returns not found for %s', async (_caseName, workspaceId) => {
    const user = await createIntegrationTestUser();
    await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(user.id);
    const token = signToken(user);
    const req = createRequest(token, workspaceId);

    await expect(authenticate(req, createResponse(), createNext())).rejects.toThrow(
      'Workspace not found',
    );
  });

  it('returns not found for a deleted workspace', async () => {
    const user = await createIntegrationTestUser();
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(user.id);
    await integrationPrisma.workspace.update({
      where: { id: workspace.id },
      data: { status: WorkspaceStatus.DELETED },
    });
    const token = signToken(user);
    const req = createRequest(token, String(workspace.id));

    await expect(authenticate(req, createResponse(), createNext())).rejects.toThrow(
      'Workspace not found',
    );
  });

  it('returns not found for another user workspace even with an extra membership row', async () => {
    const owner = await createIntegrationTestUser();
    const otherUser = await createIntegrationTestUser();
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
    await integrationPrisma.workspaceMembership.create({
      data: {
        workspaceId: workspace.id,
        userId: otherUser.id,
        role: WorkspaceMembershipRole.VIEWER,
        status: WorkspaceMembershipStatus.ACTIVE,
      },
    });
    const token = signToken(otherUser);
    const req = createRequest(token, String(workspace.id));

    await expect(authenticate(req, createResponse(), createNext())).rejects.toThrow(
      'Workspace not found',
    );
  });

  it('does not let admin role use another user workspace as request context', async () => {
    const workspaceOwner = await createIntegrationTestUser();
    const admin = await createIntegrationTestUser({ role: UserRole.ADMIN });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(
      workspaceOwner.id,
    );
    const token = signToken(admin);
    const req = createRequest(token, String(workspace.id));

    await expect(authenticate(req, createResponse(), createNext())).rejects.toThrow(
      'Workspace not found',
    );
  });
});
