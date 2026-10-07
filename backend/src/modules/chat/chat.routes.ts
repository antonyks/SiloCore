// backend/src/modules/chat/chat.routes.ts
import { Router } from 'express';
import { ChatController } from './chat.controller';
import { authenticate } from '../../middleware';
import {
  handleValidationErrors,
  validateChatGeneration,
  validateChatSessionCreate,
  validateChatSessionUpdate,
  validateChatMessageCreate,
  validateSessionId,
} from './chat.validation';

export function createChatRoutes(dependencies: {
  authenticate?: typeof authenticate;
  controller?: typeof ChatController;
} = {}) {
  const authenticateRequest = dependencies.authenticate ?? authenticate;
  const controller = dependencies.controller ?? ChatController;
  const router = Router();

  // Session routes
  router.post('/',
    authenticateRequest,
    validateChatSessionCreate,
    handleValidationErrors,
    controller.createSession
  );

  router.get('/',
    authenticateRequest,
    controller.getSessions
  );

  router.get('/:id',
    authenticateRequest,
    validateSessionId,
    handleValidationErrors,
    controller.getSessionById
  );

  router.put('/:id',
    authenticateRequest,
    validateSessionId,
    validateChatSessionUpdate,
    handleValidationErrors,
    controller.updateSession
  );

  router.delete('/:id',
    authenticateRequest,
    validateSessionId,
    handleValidationErrors,
    controller.deleteSession
  );

  router.post('/:id/generate',
    authenticateRequest,
    validateSessionId,
    validateChatGeneration,
    handleValidationErrors,
    controller.generateAssistantResponse
  );

  router.post('/:id/generate/stream',
    authenticateRequest,
    validateSessionId,
    validateChatGeneration,
    handleValidationErrors,
    controller.streamAssistantResponse
  );

  // Message routes
  router.post('/messages',
    authenticateRequest,
    validateChatMessageCreate,
    handleValidationErrors,
    controller.createMessage
  );

  router.get('/:id/messages',
    authenticateRequest,
    validateSessionId,
    handleValidationErrors,
    controller.getMessagesBySessionId
  );

  return router;
}

export default createChatRoutes();
