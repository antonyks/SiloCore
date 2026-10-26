import { LlmProviderConfigRepository } from '../../modules/llm/llmProviderConfig.repository';
import { SelectedLlmProviderConfig } from '../../modules/llm/llmProviderConfig.model';
import { mockPrisma } from '../setup';

function provider(id: number, isDefault = false): SelectedLlmProviderConfig {
  return {
    id, name: `Provider ${id}`, type: 'OLLAMA', baseUrl: 'http://localhost:11434',
    enabled: true, isDefault, defaultSource: isDefault ? 'ADMIN' : null,
    defaultModel: `model-${id}`, timeoutMs: null, generationDefaults: {},
    extraHeaders: {}, apiKey: null, deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('LlmProviderConfigRepository default selection', () => {
  it('automatically selects the oldest active provider when none is marked', async () => {
    const oldest = provider(1);
    mockPrisma.llmProviderConfig.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(oldest);
    mockPrisma.llmProviderConfig.update.mockResolvedValue({ ...oldest, isDefault: true, defaultSource: 'AUTO' });

    const result = await LlmProviderConfigRepository.getOrSelectDefault();

    expect(result?.id).toBe(1);
    expect(result?.defaultSource).toBe('AUTO');
    expect(mockPrisma.llmDefaultProviderSwitch.create).toHaveBeenCalledWith({
      data: { oldProviderId: null, newProviderId: 1, reason: 'INITIAL_SELECTION' },
    });
  });

  it('atomically marks an administrator selected provider', async () => {
    const target = provider(2);
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(target);
    mockPrisma.llmProviderConfig.update.mockResolvedValue({ ...target, isDefault: true, defaultSource: 'ADMIN' });

    const result = await LlmProviderConfigRepository.setDefault(2);

    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockPrisma.llmProviderConfig.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true }, data: { isDefault: false, defaultSource: null },
    });
    expect(mockPrisma.llmProviderConfig.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 2 }, data: { isDefault: true, defaultSource: 'ADMIN' },
    }));
    expect(result?.defaultSource).toBe('ADMIN');
    expect(mockPrisma.llmDefaultProviderSwitch.create).not.toHaveBeenCalled();
  });

  it('chooses another enabled provider and records the reason when the default is disabled', async () => {
    const old = provider(1, true);
    const next = provider(2);
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(old);
    mockPrisma.llmProviderConfig.update
      .mockResolvedValueOnce({ ...old, enabled: false, isDefault: false, defaultSource: null })
      .mockResolvedValueOnce({ ...next, isDefault: true, defaultSource: 'AUTO' });
    mockPrisma.llmProviderConfig.findFirst.mockResolvedValueOnce(next);

    const result = await LlmProviderConfigRepository.update(1, { enabled: false });

    expect(result.isDefault).toBe(false);
    expect(mockPrisma.llmProviderConfig.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { enabled: true, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }));
    expect(mockPrisma.llmDefaultProviderSwitch.create).toHaveBeenCalledWith({
      data: { oldProviderId: 1, newProviderId: 2, reason: 'PROVIDER_DISABLED' },
    });
  });

  it('promotes only while the expected default is still current', async () => {
    const old = provider(1, true);
    const next = provider(2);
    mockPrisma.llmProviderConfig.findFirst.mockResolvedValueOnce(old);
    mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(next);

    expect(await LlmProviderConfigRepository.promoteDefault(1, 2)).toBe(true);
    expect(mockPrisma.llmDefaultProviderSwitch.create).toHaveBeenCalledWith({
      data: { oldProviderId: 1, newProviderId: 2, reason: 'AVAILABILITY_FAILURE' },
    });
    mockPrisma.llmProviderConfig.findFirst.mockResolvedValueOnce(next);
    expect(await LlmProviderConfigRepository.promoteDefault(1, 2)).toBe(false);
    expect(mockPrisma.llmDefaultProviderSwitch.create).toHaveBeenCalledTimes(1);
  });
});
