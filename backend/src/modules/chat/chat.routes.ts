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

const router = Router();

// Session routes
router.post('/', 
  authenticate,
  validateChatSessionCreate,
  handleValidationErrors,
  ChatController.createSession
);

router.get('/', 
  authenticate,
  ChatController.getSessions
);

router.get('/:id', 
  authenticate,
  validateSessionId,
  handleValidationErrors,
  ChatController.getSessionById
);

router.put('/:id', 
  authenticate,
  validateSessionId,
  validateChatSessionUpdate,
  handleValidationErrors,
  ChatController.updateSession
);

router.delete('/:id', 
  authenticate,
  validateSessionId,
  handleValidationErrors,
  ChatController.deleteSession
);

router.post('/:id/generate',
  authenticate,
  validateSessionId,
  validateChatGeneration,
  handleValidationErrors,
  ChatController.generateAssistantResponse
);

router.post('/:id/generate/stream',
  authenticate,
  validateSessionId,
  validateChatGeneration,
  handleValidationErrors,
  ChatController.streamAssistantResponse
);

// Message routes
router.post('/messages', 
  authenticate,
  validateChatMessageCreate,
  handleValidationErrors,
  ChatController.createMessage
);

router.get('/:id/messages', 
  authenticate,
  validateSessionId,
  handleValidationErrors,
  ChatController.getMessagesBySessionId
);

export default router;
