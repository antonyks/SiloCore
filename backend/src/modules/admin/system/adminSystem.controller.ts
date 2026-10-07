import { Response } from 'express';
import { InvalidInputError } from '../../../errors';
import { AuthenticatedRequest } from '../../../types/authenticatedRequest';
import { AdminSystemService } from './adminSystem.service';

export interface AdminSystemControllerDependencies {
  serviceDependency: typeof AdminSystemService;
}

export function createAdminSystemController(dependencies: Partial<AdminSystemControllerDependencies> = {}) {
  const serviceDependency = dependencies.serviceDependency ?? AdminSystemService;

  const service = {
    async getAnalyticsSummary(_req: AuthenticatedRequest, res: Response): Promise<void> {
      const summary = await serviceDependency.getAnalyticsSummary(_req.query);
      res.status(200).json({ data: summary });
    },

    async getSystemStatus(_req: AuthenticatedRequest, res: Response): Promise<void> {
      const status = await serviceDependency.getSystemStatus();
      res.status(200).json({ data: status });
    },

    async createValidationJob(req: AuthenticatedRequest, res: Response): Promise<void> {
      const workspaceId = req.workspace?.id;
      const createdByUserId = req.user?.id;

      if (!workspaceId) {
        throw new InvalidInputError('Workspace context is required');
      }

      if (!createdByUserId) {
        throw new InvalidInputError('Authenticated user context is required');
      }

      const job = await serviceDependency.enqueueValidationJob({
        workspaceId,
        createdByUserId,
        mode: req.body?.mode,
      });

      res.status(202).json({ data: job });
    },
  };

  return service;
}

export type AdminSystemControllerContract = ReturnType<typeof createAdminSystemController>;
export const AdminSystemController = createAdminSystemController();
