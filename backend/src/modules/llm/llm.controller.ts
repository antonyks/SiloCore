import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/authenticatedRequest';
import { LlmRuntimeService } from './llmRuntime.service';

export const LlmController = {
  async listAvailableModels(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await LlmRuntimeService.listAvailableModels();
    res.status(200).json({ data: result });
  },
};
