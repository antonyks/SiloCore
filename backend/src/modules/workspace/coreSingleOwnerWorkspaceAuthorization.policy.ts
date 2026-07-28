import { WorkspaceType } from '@prisma/client';
import {
  AuthenticatedActorSource,
  DELETABLE_WORKSPACE_TYPES,
  WorkspaceAction,
  WorkspaceActor,
  WorkspaceAuthorizationDecision,
  WorkspaceAuthorizationDenialReason,
  WorkspaceAuthorizationPolicy,
  WorkspaceAuthorizationTarget,
} from './workspaceAuthorization.types';

const ALLOW: WorkspaceAuthorizationDecision = { allowed: true };

export class CoreSingleOwnerWorkspaceAuthorizationPolicy
  implements WorkspaceAuthorizationPolicy
{
  resolveActor(authenticatedUser?: AuthenticatedActorSource | null): WorkspaceActor | null {
    if (!authenticatedUser) {
      return null;
    }

    return {
      userId: authenticatedUser.id,
      role: authenticatedUser.role,
    };
  }

  checkWorkspaceAccess(
    actor: WorkspaceActor | null | undefined,
    workspace: WorkspaceAuthorizationTarget,
  ): WorkspaceAuthorizationDecision {
    if (!actor) {
      return {
        allowed: false,
        reason: WorkspaceAuthorizationDenialReason.MISSING_ACTOR,
      };
    }

    if (actor.userId !== workspace.ownerUserId) {
      return {
        allowed: false,
        reason: WorkspaceAuthorizationDenialReason.NOT_WORKSPACE_OWNER,
      };
    }

    return ALLOW;
  }

  checkWorkspaceAction(
    actor: WorkspaceActor | null | undefined,
    workspace: WorkspaceAuthorizationTarget,
    action: WorkspaceAction,
  ): WorkspaceAuthorizationDecision {
    const accessDecision = this.checkWorkspaceAccess(actor, workspace);

    if (!accessDecision.allowed) {
      return accessDecision;
    }

    if (
      action === WorkspaceAction.DELETE_WORKSPACE &&
      !DELETABLE_WORKSPACE_TYPES.has(workspace.type)
    ) {
      return {
        allowed: false,
        reason: WorkspaceAuthorizationDenialReason.PERSONAL_WORKSPACE_DELETE_FORBIDDEN,
      };
    }

    return ALLOW;
  }
}

export function isPersonalWorkspace(workspace: WorkspaceAuthorizationTarget): boolean {
  return workspace.type === WorkspaceType.PERSONAL;
}
