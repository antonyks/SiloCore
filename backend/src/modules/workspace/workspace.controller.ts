import { Response } from 'express';
import { InvalidInputError } from '../../errors';
import { AuthenticatedRequest } from '../../types/authenticatedRequest';
import { WorkspaceService } from './workspace.service';
import { WorkspaceCreateInput, WorkspaceUpdateInput } from './workspace.types';

function parseWorkspaceId(value: string): number {
  const id = parseInt(value, 10);
  if (isNaN(id)) {
    throw new InvalidInputError(`The ID parameter '${value}' is not a valid number.`);
  }
  return id;
}

function getAuthenticatedUserId(req: AuthenticatedRequest): number {
  const userId = req.user?.id;

  if (!userId) {
    throw new InvalidInputError('User ID is required');
  }

  return userId;
}

export const WorkspaceController = {
  async listWorkspaces(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    const workspaces = await WorkspaceService.listOwnedWorkspaces(userId);
    res.status(200).json({ data: workspaces });
  },

  async createWorkspace(req: AuthenticatedRequest, res: Response): Promise<void> {
    const ownerUserId = getAuthenticatedUserId(req);
    const data: WorkspaceCreateInput = {
      ownerUserId,
      name: req.body.name,
    };
    const workspace = await WorkspaceService.createStandardWorkspace(data);
    res.status(201).json({ data: workspace });
  },

  async getCurrentWorkspace(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.workspace) {
      throw new InvalidInputError('Workspace context is required');
    }

    const workspace = await WorkspaceService.getCurrentWorkspace(req.workspace);
    res.status(200).json({ data: workspace });
  },

  async updateWorkspace(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = parseWorkspaceId(req.params.id);
    const userId = getAuthenticatedUserId(req);
    const data: WorkspaceUpdateInput = {
      name: req.body.name,
    };
    const workspace = await WorkspaceService.updateWorkspace(id, userId, data, req.user?.role);
    res.status(200).json({ data: workspace });
  },

  async deleteWorkspace(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = parseWorkspaceId(req.params.id);
    const userId = getAuthenticatedUserId(req);
    const workspace = await WorkspaceService.deleteWorkspace(id, userId, req.user?.role);
    res.status(200).json({ data: workspace });
  },
};
