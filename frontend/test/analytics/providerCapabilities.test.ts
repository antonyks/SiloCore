import { describe, expect, it } from 'vitest';
import {
  canPullProviderModel,
  getModelProviderCapabilities,
  UNSUPPORTED_PROVIDER_CAPABILITIES,
} from '../../src/features/analytics/lib/providerCapabilities';
import type { LlmProviderModelListResult, SanitizedLlmProviderConfig } from '../../src/features/analytics/types';

const unsupportedCapabilities = UNSUPPORTED_PROVIDER_CAPABILITIES;
const pullCapableCapabilities = {
  ...UNSUPPORTED_PROVIDER_CAPABILITIES,
  completion: true,
  streaming: true,
  modelListing: true,
  modelPulling: true,
};

function createProvider(
  capabilities: SanitizedLlmProviderConfig['capabilities'],
): SanitizedLlmProviderConfig {
  return {
    id: 1,
    name: 'Provider',
    type: 'openai-compatible',
    baseUrl: 'http://provider.local',
    enabled: true,
    defaultModel: 'model-a',
    timeoutMs: null,
    generationDefaults: {},
    capabilities,
    extraHeaders: {},
    hasApiKey: false,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('provider capability helpers', () => {
  it('gates model pull from capabilities instead of provider type', () => {
    expect(canPullProviderModel(createProvider(pullCapableCapabilities))).toBe(true);
    expect(canPullProviderModel(createProvider(unsupportedCapabilities))).toBe(false);
  });

  it('returns provider capabilities for model-registry providers and all-false for missing providers', () => {
    const providers: LlmProviderModelListResult[] = [
      {
        providerId: '1',
        providerName: 'Provider',
        providerType: 'openai-compatible',
        generationDefaults: {},
        status: 'success',
        modelCount: 1,
        capabilities: pullCapableCapabilities,
      },
    ];

    expect(getModelProviderCapabilities('1', providers)).toEqual(pullCapableCapabilities);
    expect(getModelProviderCapabilities('2', providers)).toEqual(UNSUPPORTED_PROVIDER_CAPABILITIES);
  });
});
