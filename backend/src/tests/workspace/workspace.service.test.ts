import {
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { InvalidInputError, NotFoundError } from '../../errors';
import { SelectedWorkspace, WorkspaceService } from '../../modules/workspace';
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

describe('WorkspaceService', () => {
  it('lists active owned personal and standard workspaces', async () => {
    const workspaces = [
      createWorkspace({ id: 1, type: WorkspaceType.PERSONAL }),
      createWorkspace({ id: 2, type: WorkspaceType.STANDARD }),
    ];
    mockPrisma.workspace.findMany.mockResolvedValue(workspaces);

    await expect(WorkspaceService.listOwnedWorkspaces(1)).resolves.toEqual(workspaces);

    expect(mockPrisma.workspace.findMany).toHaveBeenCalledWith({
      where: {
        ownerUserId: 1,
        status: WorkspaceStatus.ACTIVE,
        type: {
          in: [WorkspaceType.PERSONAL, WorkspaceType.STANDARD],
        },
      },
      orderBy: [
        { type: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      select: expect.objectContaining({
        id: true,
        name: true,
        ownerUserId: true,
      }),
    });
  });

  it('creates a standard workspace and owner membership in one transaction', async () => {
    const workspace = createWorkspace({ id: 9, name: 'Standard Workspace' });
    mockPrisma.workspace.create.mockResolvedValue(workspace);
    mockPrisma.workspaceMembership.create.mockResolvedValue({
      id: 10,
      workspaceId: workspace.id,
      userId: workspace.ownerUserId,
      role: WorkspaceMembershipRole.OWNER,
      status: WorkspaceMembershipStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      WorkspaceService.createStandardWorkspace({
        ownerUserId: 1,
        name: 'Standard Workspace',
      }),
    ).resolves.toEqual(workspace);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.workspace.create).toHaveBeenCalledWith({
      data: {
        name: 'Standard Workspace',
        type: WorkspaceType.STANDARD,
        status: WorkspaceStatus.ACTIVE,
        ownerUserId: 1,
      },
      select: expect.objectContaining({ id: true, name: true }),
    });
    expect(mockPrisma.workspaceMembership.create).toHaveBeenCalledWith({
      data: {
        workspaceId: workspace.id,
        userId: 1,
        role: WorkspaceMembershipRole.OWNER,
        status: WorkspaceMembershipStatus.ACTIVE,
      },
    });
  });

  it('rejects blank workspace names at the service boundary', async () => {
    await expect(
      WorkspaceService.createStandardWorkspace({
        ownerUserId: 1,
        name: '   ',
      }),
    ).rejects.toThrow(InvalidInputError);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('renames an owned standard workspace', async () => {
    const workspace = createWorkspace();
    const renamed = createWorkspace({ name: 'Renamed' });
    mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
    mockPrisma.workspace.update.mockResolvedValue(renamed);

    await expect(
      WorkspaceService.updateWorkspace(1, 1, { name: 'Renamed' }),
    ).resolves.toEqual(renamed);

    expect(mockPrisma.workspace.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        ownerUserId: 1,
        status: WorkspaceStatus.ACTIVE,
      },
      select: expect.objectContaining({ id: true, name: true }),
    });
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { name: 'Renamed' },
      select: expect.objectContaining({ id: true, name: true }),
    });
  });

  it('rejects renaming a personal workspace', async () => {
    mockPrisma.workspace.findFirst.mockResolvedValue(
      createWorkspace({ type: WorkspaceType.PERSONAL }),
    );

    await expect(
      WorkspaceService.updateWorkspace(1, 1, { name: 'Renamed' }),
    ).rejects.toThrow(InvalidInputError);
    expect(mockPrisma.workspace.update).not.toHaveBeenCalled();
  });

  it('soft deletes an owned standard workspace', async () => {
    const workspace = createWorkspace();
    const deleted = createWorkspace({ status: WorkspaceStatus.DELETED });
    mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
    mockPrisma.workspace.update.mockResolvedValue(deleted);

    await expect(WorkspaceService.deleteWorkspace(1, 1)).resolves.toEqual(deleted);

    expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: WorkspaceStatus.DELETED },
      select: expect.objectContaining({ id: true, status: true }),
    });
  });

  it('rejects deleting a personal workspace', async () => {
    mockPrisma.workspace.findFirst.mockResolvedValue(
      createWorkspace({ type: WorkspaceType.PERSONAL }),
    );

    await expect(WorkspaceService.deleteWorkspace(1, 1)).rejects.toThrow(InvalidInputError);
    expect(mockPrisma.workspace.update).not.toHaveBeenCalled();
  });

  it('rejects cross-user or missing workspaces as not found', async () => {
    mockPrisma.workspace.findFirst.mockResolvedValue(null);

    await expect(
      WorkspaceService.updateWorkspace(1, 2, { name: 'Nope' }),
    ).rejects.toThrow(new NotFoundError('Workspace not found'));
  });
});
