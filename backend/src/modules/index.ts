import { Router } from 'express';
import userRoutes, { createUserRoutes } from './user/user.routes';
import authRoutes from './auth/auth.routes';
import chatRoutes, { createChatRoutes } from './chat/chat.routes';
import adminLlmRoutes, { createLlmProviderRoutes } from './admin/llm/llmProvider.routes';
import adminSystemRoutes, { createAdminSystemRoutes } from './admin/system/adminSystem.routes';
import adminWorkspaceRoutes, { createAdminWorkspaceRoutes } from './admin/workspace/adminWorkspace.routes';
import llmRoutes, { createLlmRoutes } from './llm/llm.routes';
import workspaceRoutes, { createWorkspaceRoutes } from './workspace/workspace.routes';
import jobRoutes, { createJobRoutes } from './job/job.routes';

import type { ApiComposition } from '../composition/api';
import { createChatController } from './chat/chat.controller';
import { createWorkspaceController } from './workspace/workspace.controller';
import { createLlmController } from './llm/llm.controller';
import { createJobController } from './job/job.controller';
import { createLlmProviderController } from './admin/llm/llmProvider.controller';
import { createAdminSystemController } from './admin/system/adminSystem.controller';

export const router = Router();

router.use('/users', userRoutes);
router.use('/auth', authRoutes);
router.use('/chat',chatRoutes);
router.use('/llm', llmRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/jobs', jobRoutes);
router.use('/admin', adminWorkspaceRoutes);
router.use('/admin', adminSystemRoutes);
router.use('/admin/llm', adminLlmRoutes);

export function createModuleRouter({ services, authenticate }: ApiComposition) {
  const router = Router();
  router.use('/users', createUserRoutes({ authenticate }));
  router.use('/auth', authRoutes);
  router.use('/chat', createChatRoutes({ authenticate, controller: createChatController({ serviceDependency: services.chat }) }));
  router.use('/llm', createLlmRoutes({ authenticate, controller: createLlmController({ serviceDependency: services.llm }) }));
  router.use('/workspaces', createWorkspaceRoutes({ authenticate, controller: createWorkspaceController({ serviceDependency: services.workspace }) }));
  router.use('/jobs', createJobRoutes({ authenticate, controller: createJobController({ serviceDependency: services.jobs }) }));
  router.use('/admin', createAdminWorkspaceRoutes({ authenticate }));
  router.use('/admin', createAdminSystemRoutes({ authenticate, controller: createAdminSystemController({ serviceDependency: services.analytics }) }));
  router.use('/admin/llm', createLlmProviderRoutes({ authenticate, controller: createLlmProviderController({ serviceDependency: services.providers }) }));
  return router;
}
