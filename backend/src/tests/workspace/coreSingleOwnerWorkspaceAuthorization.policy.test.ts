import { UserRole, WorkspaceStatus, WorkspaceType } from '@prisma/client';
import {
  CoreSingleOwnerWorkspaceAuthorizationPolicy,
  WorkspaceAction,
  WorkspaceAuthorizationDenialReason,
  WorkspaceAuthorizationTarget,
} from '../../modules/workspace';

function createWorkspace(
  overrides: Partial<WorkspaceAuthorizationTarget> = {},
): WorkspaceAuthorizationTarget {
  return {
    id: 1,
    ownerUserId: 100,
    type: WorkspaceType.PERSONAL,
    status: WorkspaceStatus.ACTIVE,
    ...overrides,
  };
}

describe('CoreSingleOwnerWorkspaceAuthorizationPolicy', () => {
  const policy = new CoreSingleOwnerWorkspaceAuthorizationPolicy();

  it('resolves an authenticated actor from identity data', () => {
    expect(policy.resolveActor({ id: 100, role: UserRole.USER })).toEqual({
      userId: 100,
      role: UserRole.USER,
    });
  });

  it('returns null when no authenticated actor is available', () => {
    expect(policy.resolveActor(null)).toBeNull();
    expect(policy.resolveActor(undefined)).toBeNull();
  });

  it('allows the canonical owner to access a workspace and perform normal actions', () => {
    const workspace = createWorkspace();
    const actor = { userId: workspace.ownerUserId, role: UserRole.USER };

    expect(policy.checkWorkspaceAccess(actor, workspace)).toEqual({ allowed: true });

    for (const action of [
      WorkspaceAction.READ_WORKSPACE,
      WorkspaceAction.CREATE_RESOURCE,
      WorkspaceAction.UPDATE_RESOURCE,
      WorkspaceAction.DELETE_RESOURCE,
      WorkspaceAction.UPDATE_WORKSPACE,
    ]) {
      expect(policy.checkWorkspaceAction(actor, workspace, action)).toEqual({ allowed: true });
    }
  });

  it('denies access and actions when the actor is not the canonical owner', () => {
    const workspace = createWorkspace({ ownerUserId: 100 });
    const actor = { userId: 200, role: UserRole.USER };

    expect(policy.checkWorkspaceAccess(actor, workspace)).toEqual({
      allowed: false,
      reason: WorkspaceAuthorizationDenialReason.NOT_WORKSPACE_OWNER,
    });
    expect(policy.checkWorkspaceAction(actor, workspace, WorkspaceAction.READ_WORKSPACE)).toEqual({
      allowed: false,
      reason: WorkspaceAuthorizationDenialReason.NOT_WORKSPACE_OWNER,
    });
  });

  it('does not grant administrators access to another user workspace', () => {
    const workspace = createWorkspace({ ownerUserId: 100 });
    const actor = { userId: 200, role: UserRole.ADMIN };

    expect(policy.checkWorkspaceAccess(actor, workspace)).toEqual({
      allowed: false,
      reason: WorkspaceAuthorizationDenialReason.NOT_WORKSPACE_OWNER,
    });
  });

  it('does not treat extra membership rows as Core access grants', () => {
    const workspace = createWorkspace({
      ownerUserId: 100,
      memberships: [
        {
          userId: 200,
          role: 'EDITOR',
          status: 'ACTIVE',
        },
      ],
    });
    const actor = { userId: 200, role: UserRole.USER };

    expect(policy.checkWorkspaceAccess(actor, workspace)).toEqual({
      allowed: false,
      reason: WorkspaceAuthorizationDenialReason.NOT_WORKSPACE_OWNER,
    });
  });

  it('rejects personal workspace deletion for the owner', () => {
    const workspace = createWorkspace({ type: WorkspaceType.PERSONAL });
    const actor = { userId: workspace.ownerUserId, role: UserRole.USER };

    expect(policy.checkWorkspaceAction(actor, workspace, WorkspaceAction.DELETE_WORKSPACE)).toEqual({
      allowed: false,
      reason: WorkspaceAuthorizationDenialReason.PERSONAL_WORKSPACE_DELETE_FORBIDDEN,
    });
  });

  it('allows standard workspace deletion for the owner', () => {
    const workspace = createWorkspace({ type: WorkspaceType.STANDARD });
    const actor = { userId: workspace.ownerUserId, role: UserRole.USER };

    expect(policy.checkWorkspaceAction(actor, workspace, WorkspaceAction.DELETE_WORKSPACE)).toEqual({
      allowed: true,
    });
  });

  it('denies workspace checks when no actor is available', () => {
    const workspace = createWorkspace();

    expect(policy.checkWorkspaceAccess(null, workspace)).toEqual({
      allowed: false,
      reason: WorkspaceAuthorizationDenialReason.MISSING_ACTOR,
    });
  });
});
