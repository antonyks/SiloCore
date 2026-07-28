import { UserRole, Workspace, WorkspaceType } from '@prisma/client';

export enum WorkspaceAction {
  READ_WORKSPACE = 'READ_WORKSPACE',
  CREATE_RESOURCE = 'CREATE_RESOURCE',
  UPDATE_RESOURCE = 'UPDATE_RESOURCE',
  DELETE_RESOURCE = 'DELETE_RESOURCE',
  UPDATE_WORKSPACE = 'UPDATE_WORKSPACE',
  DELETE_WORKSPACE = 'DELETE_WORKSPACE',
}

export enum WorkspaceAuthorizationDenialReason {
  MISSING_ACTOR = 'MISSING_ACTOR',
  NOT_WORKSPACE_OWNER = 'NOT_WORKSPACE_OWNER',
  PERSONAL_WORKSPACE_DELETE_FORBIDDEN = 'PERSONAL_WORKSPACE_DELETE_FORBIDDEN',
}

export interface WorkspaceActor {
  userId: number;
  role?: UserRole;
}

export type WorkspaceAuthorizationTarget = Pick<
  Workspace,
  'id' | 'ownerUserId' | 'type' | 'status'
> & {
  memberships?: unknown[];
};

export interface WorkspaceAuthorizationDecision {
  allowed: boolean;
  reason?: WorkspaceAuthorizationDenialReason;
}

export interface AuthenticatedActorSource {
  id: number;
  role?: UserRole;
}

export interface WorkspaceAuthorizationPolicy {
  resolveActor(authenticatedUser?: AuthenticatedActorSource | null): WorkspaceActor | null;
  checkWorkspaceAccess(
    actor: WorkspaceActor | null | undefined,
    workspace: WorkspaceAuthorizationTarget,
  ): WorkspaceAuthorizationDecision;
  checkWorkspaceAction(
    actor: WorkspaceActor | null | undefined,
    workspace: WorkspaceAuthorizationTarget,
    action: WorkspaceAction,
  ): WorkspaceAuthorizationDecision;
}

export const DELETABLE_WORKSPACE_TYPES = new Set<WorkspaceType>([WorkspaceType.STANDARD]);
