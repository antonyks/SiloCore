import { createJobQueueClient } from '../modules/job/jobQueue.client';
import { createCoreAuthentication, createCoreServices, CoreServiceOverrides } from './coreServices';

export function createApiComposition(
  overrides: CoreServiceOverrides = {},
  queueClient = createJobQueueClient(),
) {
  const services = createCoreServices(overrides, queueClient.getTransport);
  const authenticate = createCoreAuthentication(services, overrides.database);
  return { services, authenticate, start: queueClient.start, stop: queueClient.stop };
}

export type ApiComposition = ReturnType<typeof createApiComposition>;
