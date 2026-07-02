import { Prisma } from '@prisma/client';
import {
  LlmProviderConfigModel,
  SelectedLlmProviderConfig,
  SelectedLlmProviderConfigFields,
} from './llmProviderConfig.model';
import {
  LlmProviderConfigCreateInput,
  LlmProviderConfigUpdateInput,
  toDbProviderType,
} from './llmProviderConfig.types';

function toJsonObject(value: Record<string, string> | undefined): Prisma.InputJsonObject | undefined {
  return value === undefined ? undefined : value;
}

export const LlmProviderConfigRepository = {
  async create(data: LlmProviderConfigCreateInput): Promise<SelectedLlmProviderConfig> {
    return LlmProviderConfigModel.create({
      data: {
        name: data.name,
        type: toDbProviderType(data.type),
        baseUrl: data.baseUrl,
        enabled: data.enabled ?? true,
        defaultModel: data.defaultModel,
        timeoutMs: data.timeoutMs ?? null,
        extraHeaders: toJsonObject(data.extraHeaders),
        apiKey: data.apiKey ?? null,
      },
      select: SelectedLlmProviderConfigFields,
    });
  },

  async findAll(includeDeleted = false): Promise<SelectedLlmProviderConfig[]> {
    return LlmProviderConfigModel.findMany({
      where: includeDeleted ? undefined : { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: SelectedLlmProviderConfigFields,
    });
  },

  async findActive(): Promise<SelectedLlmProviderConfig[]> {
    return LlmProviderConfigModel.findMany({
      where: {
        enabled: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: SelectedLlmProviderConfigFields,
    });
  },

  async findById(id: number): Promise<SelectedLlmProviderConfig | null> {
    return LlmProviderConfigModel.findUnique({
      where: { id },
      select: SelectedLlmProviderConfigFields,
    });
  },

  async countActive(): Promise<number> {
    return LlmProviderConfigModel.count({
      where: {
        deletedAt: null,
      },
    });
  },

  async update(id: number, data: LlmProviderConfigUpdateInput): Promise<SelectedLlmProviderConfig> {
    const updateData: Prisma.LlmProviderConfigUpdateInput = {
      name: data.name,
      type: data.type === undefined ? undefined : toDbProviderType(data.type),
      baseUrl: data.baseUrl,
      enabled: data.enabled,
      defaultModel: data.defaultModel,
      timeoutMs: data.timeoutMs,
      extraHeaders: toJsonObject(data.extraHeaders),
    };

    if (data.apiKey !== undefined) {
      updateData.apiKey = data.apiKey;
    }

    return LlmProviderConfigModel.update({
      where: { id },
      data: updateData,
      select: SelectedLlmProviderConfigFields,
    });
  },

  async softDelete(id: number): Promise<SelectedLlmProviderConfig> {
    return LlmProviderConfigModel.update({
      where: { id },
      data: {
        enabled: false,
        deletedAt: new Date(),
      },
      select: SelectedLlmProviderConfigFields,
    });
  },
};
