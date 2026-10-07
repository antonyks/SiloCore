import { Response } from 'express';
import { InvalidInputError } from '../../../errors';
import { AuthenticatedRequest } from '../../../types/authenticatedRequest';
import { LlmProviderService } from './llmProvider.service';
import { LlmProviderCreateInput, LlmProviderUpdateInput } from './llmProvider.types';

function parseProviderId(value: string): number {
  const id = parseInt(value, 10);
  if (isNaN(id)) {
    throw new InvalidInputError(`The ID parameter '${value}' is not a valid number.`);
  }
  return id;
}

export interface LlmProviderControllerDependencies {
  serviceDependency: typeof LlmProviderService;
}

export function createLlmProviderController(dependencies: Partial<LlmProviderControllerDependencies> = {}) {
  const serviceDependency = dependencies.serviceDependency ?? LlmProviderService;

  const service = {
    async listProviders(_req: AuthenticatedRequest, res: Response): Promise<void> {
      const providers = await serviceDependency.listProviders();
      res.status(200).json({ data: providers });
    },

    async createProvider(req: AuthenticatedRequest, res: Response): Promise<void> {
      const data = req.body as LlmProviderCreateInput;
      const provider = await serviceDependency.createProvider(data);
      res.status(201).json({ data: provider });
    },

    async getProvider(req: AuthenticatedRequest, res: Response): Promise<void> {
      const id = parseProviderId(req.params.id);
      const provider = await serviceDependency.getProvider(id);
      res.status(200).json({ data: provider });
    },

    async updateProvider(req: AuthenticatedRequest, res: Response): Promise<void> {
      const id = parseProviderId(req.params.id);
      const data = req.body as LlmProviderUpdateInput;
      const provider = await serviceDependency.updateProvider(id, data);
      res.status(200).json({ data: provider });
    },

    async deleteProvider(req: AuthenticatedRequest, res: Response): Promise<void> {
      const id = parseProviderId(req.params.id);
      const provider = await serviceDependency.deleteProvider(id);
      res.status(200).json({ data: provider });
    },

    async testProvider(req: AuthenticatedRequest, res: Response): Promise<void> {
      const id = parseProviderId(req.params.id);
      const result = await serviceDependency.testProvider(id);
      res.status(200).json({ data: result });
    },

    async pullProviderModel(req: AuthenticatedRequest, res: Response): Promise<void> {
      const id = parseProviderId(req.params.id);
      const { model } = req.body;
      const result = await serviceDependency.pullProviderModel(id, model);
      res.status(200).json({ data: result });
    },
  };

  return service;
}

export type LlmProviderControllerContract = ReturnType<typeof createLlmProviderController>;
export const LlmProviderController = createLlmProviderController();
