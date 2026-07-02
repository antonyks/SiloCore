import { Router } from 'express';
import userRoutes from './user/user.routes';
import authRoutes from './auth/auth.routes';
import chatRoutes from './chat/chat.routes';
import adminLlmRoutes from './admin/llm/llmProvider.routes';
import llmRoutes from './llm/llm.routes';

export const router = Router();

router.use('/users', userRoutes);
router.use('/auth', authRoutes);
router.use('/chat',chatRoutes);
router.use('/llm', llmRoutes);
router.use('/admin/llm', adminLlmRoutes);
