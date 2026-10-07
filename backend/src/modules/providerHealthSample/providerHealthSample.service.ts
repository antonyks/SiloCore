import { ProviderHealthSampleRepository } from './providerHealthSample.repository';
import { SelectedProviderHealthSample } from './providerHealthSample.model';
import { ProviderHealthSampleCreateInput } from './providerHealthSample.types';

function normalizeOptionalInteger(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

export interface ProviderHealthSampleServiceDependencies {
  repository: typeof ProviderHealthSampleRepository;
}

export function createProviderHealthSampleService(dependencies: Partial<ProviderHealthSampleServiceDependencies> = {}) {
  const repository = dependencies.repository ?? ProviderHealthSampleRepository;

  const service = {
    async recordSample(input: ProviderHealthSampleCreateInput): Promise<SelectedProviderHealthSample> {
      return repository.create({
        providerId: input.providerId,
        providerType: input.providerType,
        operation: input.operation,
        status: input.status,
        latencyMs: normalizeOptionalInteger(input.latencyMs),
        modelCount: normalizeOptionalInteger(input.modelCount),
        errorCode: input.errorCode,
      });
    },
  };

  return service;
}

export type ProviderHealthSampleServiceContract = ReturnType<typeof createProviderHealthSampleService>;
export const ProviderHealthSampleService = createProviderHealthSampleService();
