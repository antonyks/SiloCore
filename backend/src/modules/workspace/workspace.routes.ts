import { Router } from 'express';
import { authenticate } from '../../middleware';
import { WorkspaceController } from './workspace.controller';
import {
  handleValidationErrors,
  validateWorkspaceCreate,
  validateWorkspaceId,
  validateWorkspaceUpdate,
} from './workspace.validation';

const router = Router();

router.use(authenticate);

router.get('/', WorkspaceController.listWorkspaces);

router.post(
  '/',
  validateWorkspaceCreate,
  handleValidationErrors,
  WorkspaceController.createWorkspace,
);

router.get('/current', WorkspaceController.getCurrentWorkspace);

router.put(
  '/:id',
  validateWorkspaceId,
  validateWorkspaceUpdate,
  handleValidationErrors,
  WorkspaceController.updateWorkspace,
);

router.delete(
  '/:id',
  validateWorkspaceId,
  handleValidationErrors,
  WorkspaceController.deleteWorkspace,
);

export default router;
