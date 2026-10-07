import { Router } from 'express';
import { authenticate, authorizeRoles } from '../../../middleware';
import { UserRole } from '../../user/user.model';
import { AdminWorkspaceController } from './adminWorkspace.controller';
import {
  handleValidationErrors,
  validateAdminWorkspaceId,
} from './adminWorkspace.validation';

export function createAdminWorkspaceRoutes(dependencies: {
  authenticate?: typeof authenticate;
  controller?: typeof AdminWorkspaceController;
} = {}) {
  const authenticateRequest = dependencies.authenticate ?? authenticate;
  const controller = dependencies.controller ?? AdminWorkspaceController;
  const router = Router();

  router.use(authenticateRequest, authorizeRoles(UserRole.ADMIN));

  router.get('/workspaces', controller.listWorkspaces);
  router.delete(
    '/workspaces/:id',
    validateAdminWorkspaceId,
    handleValidationErrors,
    controller.deleteWorkspace,
  );

  return router;
}

export default createAdminWorkspaceRoutes();
