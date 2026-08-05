import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { prisma } from '../../../config/database';
import {
  AdminWorkspaceMetadata,
  AdminWorkspaceMetadataSelectFields,
} from './adminWorkspace.model';
import { AdminWorkspaceListFilters } from './adminWorkspace.types';

export const AdminWorkspaceRepository = {
  listStandardWorkspaces(
    filters: AdminWorkspaceListFilters = {},
  ): Promise<AdminWorkspaceMetadata[]> {
    return prisma.workspace.findMany({
      where: {
        type: WorkspaceType.STANDARD,
        status: filters.status ?? WorkspaceStatus.ACTIVE,
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      select: AdminWorkspaceMetadataSelectFields,
    });
  },

  findStandardWorkspaceById(id: number): Promise<AdminWorkspaceMetadata | null> {
    return prisma.workspace.findFirst({
      where: {
        id,
        type: WorkspaceType.STANDARD,
      },
      select: AdminWorkspaceMetadataSelectFields,
    });
  },

  softDeleteStandardWorkspace(id: number): Promise<AdminWorkspaceMetadata> {
    return prisma.workspace.update({
      where: { id },
      data: { status: WorkspaceStatus.DELETED },
      select: AdminWorkspaceMetadataSelectFields,
    });
  },
};
