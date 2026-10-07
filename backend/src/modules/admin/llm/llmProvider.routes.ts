import { Router } from 'express';
import { authenticate, authorizeRoles } from '../../../middleware';
import { UserRole } from '../../user/user.model';
import { LlmProviderController } from './llmProvider.controller';
import {
  handleValidationErrors,
  validateModelPull,
  validateProviderCreate,
  validateProviderId,
  validateProviderUpdate,
} from './llmProvider.validation';

export function createLlmProviderRoutes(dependencies: {
  authenticate?: typeof authenticate;
  controller?: typeof LlmProviderController;
} = {}) {
  const authenticateRequest = dependencies.authenticate ?? authenticate;
  const controller = dependencies.controller ?? LlmProviderController;
  const router = Router();

  router.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

  router.get('/providers', controller.listProviders);

  router.post(
    '/providers',
    validateProviderCreate,
    handleValidationErrors,
    controller.createProvider,
  );

  router.get(
    '/providers/:id',
    validateProviderId,
    handleValidationErrors,
    controller.getProvider,
  );

  router.put(
    '/providers/:id',
    validateProviderId,
    validateProviderUpdate,
    handleValidationErrors,
    controller.updateProvider,
  );

  router.delete(
    '/providers/:id',
    validateProviderId,
    handleValidationErrors,
    controller.deleteProvider,
  );

  router.post(
    '/providers/:id/test',
    validateProviderId,
    handleValidationErrors,
    controller.testProvider,
  );

  router.post(
    '/providers/:id/models/pull',
    validateProviderId,
    validateModelPull,
    handleValidationErrors,
    controller.pullProviderModel,
  );

  return router;
}

export default createLlmProviderRoutes();
