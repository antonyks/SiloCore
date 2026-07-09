import { Prisma, LlmProviderConfig } from '@prisma/client';
import { prisma } from '../../config/database';

export type { LlmProviderConfig };

const llmProviderConfigSelection = {
  id: true,
  name: true,
  type: true,
  baseUrl: true,
  enabled: true,
  defaultModel: true,
  timeoutMs: true,
  generationDefaults: true,
  extraHeaders: true,
  apiKey: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SelectedLlmProviderConfig = Prisma.LlmProviderConfigGetPayload<{
  select: typeof llmProviderConfigSelection;
}>;

export const LlmProviderConfigModel = prisma.llmProviderConfig;
export const SelectedLlmProviderConfigFields = llmProviderConfigSelection;

export type { SelectedLlmProviderConfig };
