import { WorkspaceType } from '@prisma/client';
import { InvalidInputError, NotFoundError } from '../../errors';
import { SelectedWorkspace } from './workspace.model';
import { WorkspaceRepository } from './workspace.repository';
import { WorkspaceCreateInput, WorkspaceUpdateInput } from './workspace.types';
import { CoreSingleOwnerWorkspaceAuthorizationPolicy } from './coreSingleOwnerWorkspaceAuthorization.policy';
import {
  ResolvedWorkspaceContext,
  WorkspaceAction,
  WorkspaceActor,
  WorkspaceAuthorizationDenialReason,
} from './workspaceAuthorization.types';

const WORKSPACE_NOT_FOUND_MESSAGE = 'Workspace not found';
const PERSONAL_WORKSPACE_UPDATE_MESSAGE = 'Personal workspace cannot be renamed.';

const workspaceAuthorizationPolicy = new CoreSingleOwnerWorkspaceAuthorizationPolicy();

function normalizeWorkspaceName(name: string): string {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new InvalidInputError('Workspace name is required.');
  }

  return normalizedName;
}

function ensureWorkspaceActor(userId: number, role?: WorkspaceActor['role']): WorkspaceActor {
  return { userId, role };
}

function ensureStandardWorkspace(workspace: SelectedWorkspace, action: WorkspaceAction): void {
  if (workspace.type === WorkspaceType.STANDARD) {
    return;
  }

  if (action === WorkspaceAction.DELETE_WORKSPACE) {
    throw new InvalidInputError('Personal workspace cannot be deleted.');
  }

  throw new InvalidInputError(PERSONAL_WORKSPACE_UPDATE_MESSAGE);
}

export const WorkspaceService = {
  listOwnedWorkspaces(userId: number): Promise<SelectedWorkspace[]> {
    return WorkspaceRepository.listActiveOwnedWorkspaces(userId);
  },

  async createStandardWorkspace(input: WorkspaceCreateInput): Promise<SelectedWorkspace> {
    return WorkspaceRepository.createStandardWorkspaceWithOwnerMembership(
      input.ownerUserId,
      normalizeWorkspaceName(input.name),
    );
  },

  async getCurrentWorkspace(workspace: ResolvedWorkspaceContext): Promise<SelectedWorkspace> {
    const selectedWorkspace = await WorkspaceRepository.findActiveOwnedWorkspaceById(
      workspace.id,
      workspace.ownerUserId,
    );

    if (!selectedWorkspace) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    return selectedWorkspace;
  },

  async updateWorkspace(
    id: number,
    userId: number,
    input: WorkspaceUpdateInput,
    role?: WorkspaceActor['role'],
  ): Promise<SelectedWorkspace> {
    const workspace = await WorkspaceRepository.findActiveOwnedWorkspaceById(id, userId);

    if (!workspace) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    const actor = ensureWorkspaceActor(userId, role);
    const decision = workspaceAuthorizationPolicy.checkWorkspaceAction(
      actor,
      workspace,
      WorkspaceAction.UPDATE_WORKSPACE,
    );

    if (!decision.allowed) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    ensureStandardWorkspace(workspace, WorkspaceAction.UPDATE_WORKSPACE);

    return WorkspaceRepository.updateWorkspaceName(id, normalizeWorkspaceName(input.name));
  },

  async deleteWorkspace(
    id: number,
    userId: number,
    role?: WorkspaceActor['role'],
  ): Promise<SelectedWorkspace> {
    const workspace = await WorkspaceRepository.findActiveOwnedWorkspaceById(id, userId);

    if (!workspace) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    const actor = ensureWorkspaceActor(userId, role);
    const decision = workspaceAuthorizationPolicy.checkWorkspaceAction(
      actor,
      workspace,
      WorkspaceAction.DELETE_WORKSPACE,
    );

    if (!decision.allowed) {
      if (
        decision.reason === WorkspaceAuthorizationDenialReason.PERSONAL_WORKSPACE_DELETE_FORBIDDEN ||
        workspace.type === WorkspaceType.PERSONAL
      ) {
        throw new InvalidInputError('Personal workspace cannot be deleted.');
      }

      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    ensureStandardWorkspace(workspace, WorkspaceAction.DELETE_WORKSPACE);

    return WorkspaceRepository.softDeleteWorkspace(id);
  },
};
