import { Router } from 'express';
import { authenticate } from '../../middleware';
import { JobController } from './job.controller';
import {
  handleValidationErrors,
  validateJobId,
} from './job.validation';

export function createJobRoutes(dependencies: {
  authenticate?: typeof authenticate;
  controller?: typeof JobController;
} = {}) {
  const authenticateRequest = dependencies.authenticate ?? authenticate;
  const controller = dependencies.controller ?? JobController;
  const router = Router();

  router.use(authenticateRequest);

  router.get(
    '/:jobId',
    validateJobId,
    handleValidationErrors,
    controller.getJob,
  );

  router.get(
    '/:jobId/stream',
    validateJobId,
    handleValidationErrors,
    controller.streamJob,
  );

  router.post(
    '/:jobId/cancel',
    validateJobId,
    handleValidationErrors,
    controller.cancelJob,
  );

  return router;
}

export default createJobRoutes();
