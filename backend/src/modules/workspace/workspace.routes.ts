import { Router } from 'express';
import { authenticate } from '../../middleware';
import { WorkspaceController } from './workspace.controller';
import {
  handleValidationErrors,
  validateWorkspaceCreate,
  validateWorkspaceId,
  validateWorkspaceUpdate,
} from './workspace.validation';

export function createWorkspaceRoutes(dependencies: {
  authenticate?: typeof authenticate;
  controller?: typeof WorkspaceController;
} = {}) {
  const authenticateRequest = dependencies.authenticate ?? authenticate;
  const controller = dependencies.controller ?? WorkspaceController;
  const router = Router();

  router.use(authenticateRequest);

  router.get('/', controller.listWorkspaces);

  router.post(
    '/',
    validateWorkspaceCreate,
    handleValidationErrors,
    controller.createWorkspace,
  );

  router.get('/current', controller.getCurrentWorkspace);

  router.put(
    '/:id',
    validateWorkspaceId,
    validateWorkspaceUpdate,
    handleValidationErrors,
    controller.updateWorkspace,
  );

  router.delete(
    '/:id',
    validateWorkspaceId,
    handleValidationErrors,
    controller.deleteWorkspace,
  );

  return router;
}

export default createWorkspaceRoutes();
