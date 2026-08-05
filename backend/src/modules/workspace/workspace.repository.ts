import {
  Prisma,
  PrismaClient,
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceStatus,
  WorkspaceType,
} from '@prisma/client';
import { prisma } from '../../config/database';
import { SelectedWorkspace, WorkspaceSelectFields } from './workspace.model';

type WorkspaceRepositoryClient = PrismaClient | Prisma.TransactionClient;

export const WorkspaceRepository = {
  listActiveOwnedWorkspaces(ownerUserId: number): Promise<SelectedWorkspace[]> {
    return prisma.workspace.findMany({
      where: {
        ownerUserId,
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
      select: WorkspaceSelectFields,
    });
  },

  findActiveOwnedWorkspaceById(
    id: number,
    ownerUserId: number,
    db: WorkspaceRepositoryClient = prisma,
  ): Promise<SelectedWorkspace | null> {
    return db.workspace.findFirst({
      where: {
        id,
        ownerUserId,
        status: WorkspaceStatus.ACTIVE,
      },
      select: WorkspaceSelectFields,
    });
  },

  async createStandardWorkspaceWithOwnerMembership(
    ownerUserId: number,
    name: string,
  ): Promise<SelectedWorkspace> {
    return prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name,
          type: WorkspaceType.STANDARD,
          status: WorkspaceStatus.ACTIVE,
          ownerUserId,
        },
        select: WorkspaceSelectFields,
      });

      await tx.workspaceMembership.create({
        data: {
          workspaceId: workspace.id,
          userId: ownerUserId,
          role: WorkspaceMembershipRole.OWNER,
          status: WorkspaceMembershipStatus.ACTIVE,
        },
      });

      return workspace;
    });
  },

  updateWorkspaceName(id: number, name: string): Promise<SelectedWorkspace> {
    return prisma.workspace.update({
      where: { id },
      data: { name },
      select: WorkspaceSelectFields,
    });
  },

  softDeleteWorkspace(id: number): Promise<SelectedWorkspace> {
    return prisma.workspace.update({
      where: { id },
      data: { status: WorkspaceStatus.DELETED },
      select: WorkspaceSelectFields,
    });
  },
};
