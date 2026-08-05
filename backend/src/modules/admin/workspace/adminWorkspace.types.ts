import { WorkspaceStatus } from '@prisma/client';

export interface AdminWorkspaceListFilters {
  status?: WorkspaceStatus;
}
