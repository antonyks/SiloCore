import { Router } from 'express';
import { authenticate } from '../../middleware';
import { LlmController } from './llm.controller';

const router = Router();

router.get('/models', authenticate, LlmController.listAvailableModels);

export default router;
