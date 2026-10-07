import { Router } from 'express';
import { authenticate } from '../../middleware';
import { LlmController } from './llm.controller';

export function createLlmRoutes(dependencies: {
  authenticate?: typeof authenticate;
  controller?: typeof LlmController;
} = {}) {
  const authenticateRequest = dependencies.authenticate ?? authenticate;
  const controller = dependencies.controller ?? LlmController;
  const router = Router();

  router.get('/models', authenticateRequest, controller.listAvailableModels);
  router.get('/providers/:id/models', authenticateRequest, controller.listProviderModels);

  return router;
}

export default createLlmRoutes();
