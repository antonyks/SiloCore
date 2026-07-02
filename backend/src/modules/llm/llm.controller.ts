import { Response } from 'express';
import { InvalidInputError } from '../../errors';
import { AuthenticatedRequest } from '../../types/authenticatedRequest';
import { LlmRuntimeService } from './llmRuntime.service';

function parseProviderId(value: string): number {
  const id = parseInt(value, 10);
  if (isNaN(id)) {
    throw new InvalidInputError(`The ID parameter '${value}' is not a valid number.`);
  }
  return id;
}

export const LlmController = {
  async listAvailableModels(_req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await LlmRuntimeService.listAvailableModels();
    res.status(200).json({ data: result });
  },

  async listProviderModels(req: AuthenticatedRequest, res: Response): Promise<void> {
    const id = parseProviderId(req.params.id);
    const result = await LlmRuntimeService.listProviderModels(id);
    res.status(200).json({ data: result });
  },
};
