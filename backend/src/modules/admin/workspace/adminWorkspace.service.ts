import { WorkspaceStatus } from '@prisma/client';
import { NotFoundError } from '../../../errors';
import { AdminWorkspaceMetadata } from './adminWorkspace.model';
import { AdminWorkspaceRepository } from './adminWorkspace.repository';
import { AdminWorkspaceListFilters } from './adminWorkspace.types';

const WORKSPACE_NOT_FOUND_MESSAGE = 'Workspace not found';

export const AdminWorkspaceService = {
  listStandardWorkspaces(
    filters: AdminWorkspaceListFilters = {},
  ): Promise<AdminWorkspaceMetadata[]> {
    return AdminWorkspaceRepository.listStandardWorkspaces({
      status: filters.status ?? WorkspaceStatus.ACTIVE,
    });
  },

  async softDeleteStandardWorkspace(id: number): Promise<AdminWorkspaceMetadata> {
    const workspace = await AdminWorkspaceRepository.findStandardWorkspaceById(id);

    if (!workspace) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    if (workspace.status === WorkspaceStatus.DELETED) {
      return workspace;
    }

    return AdminWorkspaceRepository.softDeleteStandardWorkspace(id);
  },
};
