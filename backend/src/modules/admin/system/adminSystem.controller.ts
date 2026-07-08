import { Response } from 'express';
import { AuthenticatedRequest } from '../../../types/authenticatedRequest';
import { AdminSystemService } from './adminSystem.service';

export const AdminSystemController = {
  async getAnalyticsSummary(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const summary = await AdminSystemService.getAnalyticsSummary();
    res.status(200).json({ data: summary });
  },

  async getSystemStatus(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const status = await AdminSystemService.getSystemStatus();
    res.status(200).json({ data: status });
  },
};
