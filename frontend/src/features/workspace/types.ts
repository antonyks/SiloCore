export type WorkspaceType = 'PERSONAL' | 'STANDARD';
export type WorkspaceStatus = 'ACTIVE' | 'DELETED';

export interface Workspace {
  id: number;
  name: string;
  type: WorkspaceType;
  status: WorkspaceStatus;
  ownerUserId: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceCreateInput {
  name: string;
}

export interface WorkspaceUpdateInput {
  name: string;
}
