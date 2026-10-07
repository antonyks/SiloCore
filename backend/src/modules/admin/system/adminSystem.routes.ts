import { Router } from 'express';
import { authenticate, authorizeRoles } from '../../../middleware';
import { UserRole } from '../../user/user.model';
import { AdminSystemController } from './adminSystem.controller';

export function createAdminSystemRoutes(dependencies: {
  authenticate?: typeof authenticate;
  controller?: typeof AdminSystemController;
} = {}) {
  const authenticateRequest = dependencies.authenticate ?? authenticate;
  const controller = dependencies.controller ?? AdminSystemController;
  const router = Router();

  router.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

  router.get('/analytics/summary', controller.getAnalyticsSummary);
  router.get('/system/status', controller.getSystemStatus);
  router.post('/system/validation-jobs', controller.createValidationJob);

  return router;
}

export default createAdminSystemRoutes();
