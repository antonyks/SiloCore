import { LlmDefaultSource, LlmDefaultSwitchReason, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
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

function toJsonObject(value: unknown): Prisma.InputJsonObject | undefined {
  if (value === null) return {};
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

function toHeaderJsonObject(value: Record<string, string> | undefined): Prisma.InputJsonObject | undefined {
  return value === undefined ? undefined : value;
}

type Transaction = Prisma.TransactionClient;

async function lockDefault(tx: Transaction): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(753006, 1) IS NULL AS locked`;
}

async function currentDefault(tx: Transaction) {
  return tx.llmProviderConfig.findFirst({ where: { isDefault: true }, select: SelectedLlmProviderConfigFields });
}

async function firstActive(tx: Transaction) {
  return tx.llmProviderConfig.findFirst({
    where: { enabled: true, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: SelectedLlmProviderConfigFields,
  });
}

async function selectAutomatic(tx: Transaction, oldProviderId: number | null, reason: LlmDefaultSwitchReason) {
  const next = await firstActive(tx);
  if (!next) return null;
  const selected = await tx.llmProviderConfig.update({
    where: { id: next.id },
    data: { isDefault: true, defaultSource: LlmDefaultSource.AUTO },
    select: SelectedLlmProviderConfigFields,
  });
  await tx.llmDefaultProviderSwitch.create({
    data: { oldProviderId, newProviderId: selected.id, reason },
  });
  return selected;
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
        generationDefaults: toJsonObject(data.generationDefaults ?? {}),
        extraHeaders: toHeaderJsonObject(data.extraHeaders),
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
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

  async getOrSelectDefault(): Promise<SelectedLlmProviderConfig | null> {
    const selected = await LlmProviderConfigModel.findFirst({
      where: { isDefault: true }, select: SelectedLlmProviderConfigFields,
    });
    if (selected) return selected;
    return prisma.$transaction(async (tx) => {
      await lockDefault(tx);
      const current = await currentDefault(tx);
      if (current) return current;
      return selectAutomatic(tx, null, LlmDefaultSwitchReason.INITIAL_SELECTION);
    });
  },

  async setDefault(id: number): Promise<SelectedLlmProviderConfig | null> {
    return prisma.$transaction(async (tx) => {
      await lockDefault(tx);
      const target = await tx.llmProviderConfig.findUnique({ where: { id }, select: SelectedLlmProviderConfigFields });
      if (!target || !target.enabled || target.deletedAt) return null;
      await tx.llmProviderConfig.updateMany({
        where: { isDefault: true }, data: { isDefault: false, defaultSource: null },
      });
      return tx.llmProviderConfig.update({
        where: { id }, data: { isDefault: true, defaultSource: LlmDefaultSource.ADMIN },
        select: SelectedLlmProviderConfigFields,
      });
    });
  },

  async promoteDefault(fromId: number, toId: number): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      await lockDefault(tx);
      const current = await currentDefault(tx);
      const target = await tx.llmProviderConfig.findUnique({ where: { id: toId } });
      if (current?.id !== fromId || !target?.enabled || target.deletedAt || fromId === toId) return false;
      await tx.llmProviderConfig.update({
        where: { id: fromId }, data: { isDefault: false, defaultSource: null },
      });
      await tx.llmProviderConfig.update({
        where: { id: toId }, data: { isDefault: true, defaultSource: LlmDefaultSource.AUTO },
      });
      await tx.llmDefaultProviderSwitch.create({
        data: {
          oldProviderId: fromId,
          newProviderId: toId,
          reason: LlmDefaultSwitchReason.AVAILABILITY_FAILURE,
        },
      });
      return true;
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
      generationDefaults: toJsonObject(data.generationDefaults),
      extraHeaders: toHeaderJsonObject(data.extraHeaders),
    };

    if (data.apiKey !== undefined) {
      updateData.apiKey = data.apiKey;
    }

    return prisma.$transaction(async (tx) => {
      await lockDefault(tx);
      const current = await tx.llmProviderConfig.findUnique({ where: { id } });
      const removingDefault = Boolean(current?.isDefault && data.enabled === false);
      if (removingDefault) {
        updateData.isDefault = false;
        updateData.defaultSource = null;
      }
      const updated = await tx.llmProviderConfig.update({
        where: { id }, data: updateData, select: SelectedLlmProviderConfigFields,
      });
      if (removingDefault) {
        await selectAutomatic(tx, id, LlmDefaultSwitchReason.PROVIDER_DISABLED);
      } else if (!await currentDefault(tx)) {
        await selectAutomatic(tx, null, LlmDefaultSwitchReason.INITIAL_SELECTION);
      }
      return updated;
    });
  },

  async softDelete(id: number): Promise<SelectedLlmProviderConfig> {
    return prisma.$transaction(async (tx) => {
      await lockDefault(tx);
      const current = await tx.llmProviderConfig.findUnique({ where: { id } });
      const updated = await tx.llmProviderConfig.update({
        where: { id },
        data: { enabled: false, deletedAt: new Date(), isDefault: false, defaultSource: null },
        select: SelectedLlmProviderConfigFields,
      });
      if (current?.isDefault) await selectAutomatic(tx, id, LlmDefaultSwitchReason.PROVIDER_DELETED);
      return updated;
    });
  },
};
