import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { InvalidInputError } from '../../errors';
import { AdminWorkspaceController } from '../../modules/admin/workspace/adminWorkspace.controller';
import { AdminWorkspaceMetadata } from '../../modules/admin/workspace/adminWorkspace.model';
import { createAuthenticatedMockRequest, createMockResponse } from '../testUtils';
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

describe('AdminWorkspaceController', () => {
  it('lists active standard workspace metadata by default', async () => {
    const workspaces = [createWorkspace()];
    mockPrisma.workspace.findMany.mockResolvedValue(workspaces);
    const res = createMockResponse();

    await AdminWorkspaceController.listWorkspaces(
      createAuthenticatedMockRequest({ query: {} }),
      res,
    );

    expect(mockPrisma.workspace.findMany).toHaveBeenCalledWith({
      where: {
        type: WorkspaceType.STANDARD,
        status: WorkspaceStatus.ACTIVE,
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      select: expect.objectContaining({
        id: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      }),
    });
    expect(mockPrisma.chatSession.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.findMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: workspaces });
  });

  it('lists deleted standard workspace metadata when requested', async () => {
    const workspaces = [createWorkspace({ status: WorkspaceStatus.DELETED })];
    mockPrisma.workspace.findMany.mockResolvedValue(workspaces);
    const res = createMockResponse();

    await AdminWorkspaceController.listWorkspaces(
      createAuthenticatedMockRequest({ query: { status: WorkspaceStatus.DELETED } }),
      res,
    );

    expect(mockPrisma.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: WorkspaceType.STANDARD,
          status: WorkspaceStatus.DELETED,
        },
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: workspaces });
  });

  it('rejects workspace type filtering', async () => {
    const res = createMockResponse();

    await expect(
      AdminWorkspaceController.listWorkspaces(
        createAuthenticatedMockRequest({ query: { type: WorkspaceType.PERSONAL } }),
        res,
      ),
    ).rejects.toThrow(InvalidInputError);
    expect(mockPrisma.workspace.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid status filtering', async () => {
    const res = createMockResponse();

    await expect(
      AdminWorkspaceController.listWorkspaces(
        createAuthenticatedMockRequest({ query: { status: 'BANNED' } }),
        res,
      ),
    ).rejects.toThrow(InvalidInputError);
    expect(mockPrisma.workspace.findMany).not.toHaveBeenCalled();
  });

  it('soft deletes a standard workspace by id', async () => {
    const workspace = createWorkspace();
    const deleted = createWorkspace({ status: WorkspaceStatus.DELETED });
    mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
    mockPrisma.workspace.update.mockResolvedValue(deleted);
    const res = createMockResponse();

    await AdminWorkspaceController.deleteWorkspace(
      createAuthenticatedMockRequest({ params: { id: '1' } }),
      res,
    );

    expect(mockPrisma.workspace.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        type: WorkspaceType.STANDARD,
      },
      select: expect.any(Object),
    });
    expect(mockPrisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: WorkspaceStatus.DELETED },
      select: expect.any(Object),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: deleted });
  });
});
