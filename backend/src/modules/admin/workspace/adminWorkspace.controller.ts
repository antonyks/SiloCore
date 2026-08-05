import { WorkspaceStatus } from '@prisma/client';
import { Response } from 'express';
import { InvalidInputError } from '../../../errors';
import { AuthenticatedRequest } from '../../../types/authenticatedRequest';
import { AdminWorkspaceService } from './adminWorkspace.service';

function parseWorkspaceId(value: string): number {
  const id = parseInt(value, 10);

  if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== value.trim()) {
    throw new InvalidInputError(`The ID parameter '${value}' is not a valid number.`);
  }

  return id;
}

function parseWorkspaceStatus(value: unknown): WorkspaceStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === WorkspaceStatus.ACTIVE || value === WorkspaceStatus.DELETED) {
    return value;
  }

  throw new InvalidInputError('Workspace status must be ACTIVE or DELETED.');
}

function rejectTypeFilter(value: unknown): void {
  if (value === undefined) {
    return;
  }

  throw new InvalidInputError('Workspace type filtering is not supported for admin workspace metadata.');
}

export const AdminWorkspaceController = {
  async listWorkspaces(req: AuthenticatedRequest, res: Response): Promise<void> {
    rejectTypeFilter(req.query.type);
    const status = parseWorkspaceStatus(req.query.status);
    const workspaces = await AdminWorkspaceService.listStandardWorkspaces({ status });

    res.status(200).json({ data: workspaces });
  },

  async deleteWorkspace(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = parseWorkspaceId(req.params.id);
    const workspace = await AdminWorkspaceService.softDeleteStandardWorkspace(id);

    res.status(200).json({ data: workspace });
  },
};
