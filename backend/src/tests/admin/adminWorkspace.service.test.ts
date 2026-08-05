import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { NotFoundError } from '../../errors';
import { AdminWorkspaceMetadata } from '../../modules/admin/workspace/adminWorkspace.model';
import { AdminWorkspaceService } from '../../modules/admin/workspace/adminWorkspace.service';
import { mockPrisma } from '../setup';

function createWorkspace(
  overrides: Partial<AdminWorkspaceMetadata> = {},
): AdminWorkspaceMetadata {
  return {
    id: 1,
    name: 'Standard Workspace',
    type: WorkspaceType.STANDARD,
    status: WorkspaceStatus.ACTIVE,
    ownerUserId: 5,
    owner: {
      id: 5,
      email: 'owner@example.com',
      name: 'Owner',
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AdminWorkspaceService', () => {
  it('defaults listing to active standard workspaces', async () => {
    const workspaces = [createWorkspace()];
    mockPrisma.workspace.findMany.mockResolvedValue(workspaces);

    await expect(AdminWorkspaceService.listStandardWorkspaces()).resolves.toEqual(workspaces);

    expect(mockPrisma.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: WorkspaceType.STANDARD,
          status: WorkspaceStatus.ACTIVE,
        },
      }),
    );
  });

  it('allows listing deleted standard workspaces explicitly', async () => {
    const workspaces = [createWorkspace({ status: WorkspaceStatus.DELETED })];
    mockPrisma.workspace.findMany.mockResolvedValue(workspaces);

    await expect(
      AdminWorkspaceService.listStandardWorkspaces({ status: WorkspaceStatus.DELETED }),
    ).resolves.toEqual(workspaces);

    expect(mockPrisma.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: WorkspaceType.STANDARD,
          status: WorkspaceStatus.DELETED,
        },
      }),
    );
  });

  it('soft deletes an active standard workspace', async () => {
    const workspace = createWorkspace();
    const deleted = createWorkspace({ status: WorkspaceStatus.DELETED });
    mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
    mockPrisma.workspace.update.mockResolvedValue(deleted);

    await expect(AdminWorkspaceService.softDeleteStandardWorkspace(1)).resolves.toEqual(deleted);

    expect(mockPrisma.workspace.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 1,
          type: WorkspaceType.STANDARD,
        },
      }),
    );
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { status: WorkspaceStatus.DELETED },
      }),
    );
  });

  it('does not expose personal workspaces through delete', async () => {
    mockPrisma.workspace.findFirst.mockResolvedValue(null);

    await expect(AdminWorkspaceService.softDeleteStandardWorkspace(1)).rejects.toThrow(
      new NotFoundError('Workspace not found'),
    );
    expect(mockPrisma.workspace.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 1,
          type: WorkspaceType.STANDARD,
        },
      }),
    );
    expect(mockPrisma.workspace.update).not.toHaveBeenCalled();
  });

  it('returns an already deleted standard workspace without updating it again', async () => {
    const deleted = createWorkspace({ status: WorkspaceStatus.DELETED });
    mockPrisma.workspace.findFirst.mockResolvedValue(deleted);

    await expect(AdminWorkspaceService.softDeleteStandardWorkspace(1)).resolves.toEqual(deleted);

    expect(mockPrisma.workspace.update).not.toHaveBeenCalled();
  });
});
