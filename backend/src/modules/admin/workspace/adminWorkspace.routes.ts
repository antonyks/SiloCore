import { Router } from 'express';
import { authenticate, authorizeRoles } from '../../../middleware';
import { UserRole } from '../../user/user.model';
import { AdminWorkspaceController } from './adminWorkspace.controller';
import {
  handleValidationErrors,
  validateAdminWorkspaceId,
} from './adminWorkspace.validation';

const router = Router();

router.use(authenticate, authorizeRoles(UserRole.ADMIN));

router.get('/workspaces', AdminWorkspaceController.listWorkspaces);
router.delete(
  '/workspaces/:id',
  validateAdminWorkspaceId,
  handleValidationErrors,
  AdminWorkspaceController.deleteWorkspace,
);

export default router;
