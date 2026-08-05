import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { InvalidInputError } from '../../errors';
import { SelectedWorkspace, WorkspaceController } from '../../modules/workspace';
import { createAuthenticatedMockRequest, createMockResponse } from '../testUtils';
import { mockPrisma } from '../setup';

function createWorkspace(overrides: Partial<SelectedWorkspace> = {}): SelectedWorkspace {
  return {
    id: 1,
    name: 'Workspace',
    type: WorkspaceType.STANDARD,
    status: WorkspaceStatus.ACTIVE,
    ownerUserId: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createUser() {
  return {
    id: 1,
    email: 'user@example.com',
    name: 'User',
    role: 'USER',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  } as const;
}

describe('WorkspaceController', () => {
  it('lists owned workspaces', async () => {
    const workspaces = [createWorkspace({ type: WorkspaceType.PERSONAL }), createWorkspace({ id: 2 })];
    mockPrisma.workspace.findMany.mockResolvedValue(workspaces);
    const res = createMockResponse();

    await WorkspaceController.listWorkspaces(
      createAuthenticatedMockRequest({ user: createUser() }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: workspaces });
  });

  it('creates a standard workspace', async () => {
    const workspace = createWorkspace({ id: 9, name: 'Project Workspace' });
    mockPrisma.workspace.create.mockResolvedValue(workspace);
    mockPrisma.workspaceMembership.create.mockResolvedValue({
      id: 10,
      workspaceId: workspace.id,
      userId: 1,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = createMockResponse();

    await WorkspaceController.createWorkspace(
      createAuthenticatedMockRequest({
        user: createUser(),
        body: { name: 'Project Workspace' },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: workspace });
  });

  it('returns the current request workspace', async () => {
    const workspace = createWorkspace({ id: 25, name: 'Current Workspace' });
    mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
    const res = createMockResponse();

    await WorkspaceController.getCurrentWorkspace(
      createAuthenticatedMockRequest({
        user: createUser(),
        workspace: {
          id: workspace.id,
          name: workspace.name,
          ownerUserId: workspace.ownerUserId,
          type: workspace.type,
          status: workspace.status,
        },
      }),
      res,
    );

    expect(mockPrisma.workspace.findFirst).toHaveBeenCalledWith({
      where: {
        id: workspace.id,
        ownerUserId: workspace.ownerUserId,
        status: WorkspaceStatus.ACTIVE,
      },
      select: expect.objectContaining({
        id: true,
        createdAt: true,
        updatedAt: true,
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: workspace });
  });

  it('renames a workspace by id', async () => {
    const workspace = createWorkspace();
    const renamed = createWorkspace({ name: 'Renamed' });
    mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
    mockPrisma.workspace.update.mockResolvedValue(renamed);
    const res = createMockResponse();

    await WorkspaceController.updateWorkspace(
      createAuthenticatedMockRequest({
        user: createUser(),
        params: { id: '1' },
        body: { name: 'Renamed' },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: renamed });
  });

  it('soft deletes a workspace by id', async () => {
    const workspace = createWorkspace();
    const deleted = createWorkspace({ status: WorkspaceStatus.DELETED });
    mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
    mockPrisma.workspace.update.mockResolvedValue(deleted);
    const res = createMockResponse();

    await WorkspaceController.deleteWorkspace(
      createAuthenticatedMockRequest({
        user: createUser(),
        params: { id: '1' },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: deleted });
  });

  it('throws InvalidInputError when current workspace context is missing', async () => {
    const res = createMockResponse();

    await expect(
      WorkspaceController.getCurrentWorkspace(
        createAuthenticatedMockRequest({ user: createUser() }),
        res,
      ),
    ).rejects.toThrow(InvalidInputError);
  });
});
