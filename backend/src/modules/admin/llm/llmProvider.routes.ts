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

const router = Router();

router.use(authenticate, authorizeRoles(UserRole.ADMIN));

router.get('/providers', LlmProviderController.listProviders);

router.post(
  '/providers',
  validateProviderCreate,
  handleValidationErrors,
  LlmProviderController.createProvider,
);

router.get(
  '/providers/:id',
  validateProviderId,
  handleValidationErrors,
  LlmProviderController.getProvider,
);

router.put(
  '/providers/:id',
  validateProviderId,
  validateProviderUpdate,
  handleValidationErrors,
  LlmProviderController.updateProvider,
);

router.delete(
  '/providers/:id',
  validateProviderId,
  handleValidationErrors,
  LlmProviderController.deleteProvider,
);

router.post(
  '/providers/:id/test',
  validateProviderId,
  handleValidationErrors,
  LlmProviderController.testProvider,
);

router.post(
  '/providers/:id/models/pull',
  validateProviderId,
  validateModelPull,
  handleValidationErrors,
  LlmProviderController.pullProviderModel,
);

export default router;
