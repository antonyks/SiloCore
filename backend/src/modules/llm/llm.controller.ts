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

export interface LlmControllerDependencies {
  serviceDependency: typeof LlmRuntimeService;
}

export function createLlmController(dependencies: Partial<LlmControllerDependencies> = {}) {
  const serviceDependency = dependencies.serviceDependency ?? LlmRuntimeService;

  const service = {
    async listAvailableModels(_req: AuthenticatedRequest, res: Response): Promise<void> {
      const result = await serviceDependency.listAvailableModels();
      res.status(200).json({ data: result });
    },

    async listProviderModels(req: AuthenticatedRequest, res: Response): Promise<void> {
      const id = parseProviderId(req.params.id);
      const result = await serviceDependency.listProviderModels(id);
      res.status(200).json({ data: result });
    },
  };

  return service;
}

export type LlmControllerContract = ReturnType<typeof createLlmController>;
export const LlmController = createLlmController();
