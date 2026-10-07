import { Router } from 'express';
import { UserController } from './user.controller';
import { authenticate, authorizeRoles } from '../../middleware'
import { UserRole } from '../user/user.model'
import { handleValidationErrors, validateBanActivate, validateChangePassword, validateCreateUser, validateSearch, validateUpdateUser, validateUserId } from './user.validation';


export function createUserRoutes(dependencies: {
  authenticate?: typeof authenticate;
  controller?: typeof UserController;
} = {}) {
  const authenticateRequest = dependencies.authenticate ?? authenticate;
  const controller = dependencies.controller ?? UserController;
  const router = Router();


  router.get('/profile',
      authenticateRequest,
      controller.getUserProfile
  );

  router.post('/',
    authenticateRequest,
    authorizeRoles(UserRole.ADMIN),
    validateCreateUser,
    handleValidationErrors,
    controller.createUser
  );

  router.get('/',
    authenticateRequest,
    authorizeRoles(UserRole.ADMIN),
    validateSearch,
    handleValidationErrors,
    controller.getAllUsers
  );

  router.get('/:id',
    authenticateRequest,
    authorizeRoles(UserRole.ADMIN),
    validateUserId,
    handleValidationErrors,
    controller.getUserById
  );

  router.put('/:id',
    authenticateRequest,
    authorizeRoles(UserRole.ADMIN),
    validateUserId,
    validateUpdateUser,
    handleValidationErrors,
    controller.updateUserById
  );

  router.delete('/:id',
    authenticateRequest,
    authorizeRoles(UserRole.ADMIN),
    validateUserId,
    handleValidationErrors,
    controller.deleteUserById
  );

  router.post('/ban/:id',
    authenticateRequest,
    authorizeRoles(UserRole.ADMIN),
    validateBanActivate,
    handleValidationErrors,
    controller.banUserById
  );

  router.post('/activate/:id',
    authenticateRequest,
    authorizeRoles(UserRole.ADMIN),
    validateBanActivate,
    handleValidationErrors,
    controller.activateUserById
  );

  router.post('/change-password',
    authenticateRequest,
    validateChangePassword,
    handleValidationErrors,
    controller.updateUserPassword
  );

  return router;
}

export default createUserRoutes();
