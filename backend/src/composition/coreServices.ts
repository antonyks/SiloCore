import { prisma } from '../config/database';
import { createAuthenticate } from '../middleware/auth.middleware';
import { CoreSingleOwnerWorkspaceAuthorizationPolicy } from '../modules/workspace/coreSingleOwnerWorkspaceAuthorization.policy';
import { WorkspaceAuthorizationPolicy } from '../modules/workspace/workspaceAuthorization.types';
import { createWorkspaceService, WorkspaceServiceContract } from '../modules/workspace/workspace.service';
import { createChatService, ChatServiceContract } from '../modules/chat/chat.service';
import { createLlmRuntimeService, LlmRuntimeServiceContract } from '../modules/llm/llmRuntime.service';
import { createLlmProviderService, LlmProviderServiceContract } from '../modules/admin/llm/llmProvider.service';
import { createAdminSystemService, AdminSystemServiceContract } from '../modules/admin/system/adminSystem.service';
import { createJobService, JobServiceContract } from '../modules/job/job.service';
import { createGenerationUsageService, GenerationUsageServiceContract } from '../modules/generationUsage/generationUsage.service';
import { createJobMetricService, JobMetricServiceContract } from '../modules/jobMetric/jobMetric.service';
import { createProviderHealthSampleService, ProviderHealthSampleServiceContract } from '../modules/providerHealthSample/providerHealthSample.service';
import { enqueueValidationJob } from '../modules/worker/validationJob';
import { JobQueueTransport } from '../modules/job/job.types';
import { ProviderAdapterFactories, coreProviderFactories } from './providerAdapters';

export interface CoreServices {
  policy: WorkspaceAuthorizationPolicy;
  workspace: WorkspaceServiceContract;
  chat: ChatServiceContract;
  llm: LlmRuntimeServiceContract;
  providers: LlmProviderServiceContract;
  jobs: JobServiceContract;
  usage: GenerationUsageServiceContract;
  jobMetrics: JobMetricServiceContract;
  healthSamples: ProviderHealthSampleServiceContract;
  analytics: AdminSystemServiceContract;
}

export type CoreServiceOverrides = Partial<CoreServices> & {
  providerFactories?: ProviderAdapterFactories;
  database?: typeof prisma;
};

/** Construct services only. Database, queue, timers and threads are started separately. */
export function createCoreServices(
  overrides: CoreServiceOverrides = {},
  queueTransport: () => JobQueueTransport = () => {
    throw new Error('Job queue client has not been started.');
  },
): CoreServices {
  const policy = overrides.policy ?? new CoreSingleOwnerWorkspaceAuthorizationPolicy();
  const usage = overrides.usage ?? createGenerationUsageService();
  const jobMetrics = overrides.jobMetrics ?? createJobMetricService();
  const healthSamples = overrides.healthSamples ?? createProviderHealthSampleService();
  const llm = overrides.llm ?? createLlmRuntimeService({
    adapterFactories: overrides.providerFactories ?? coreProviderFactories,
    healthSamples,
  });
  const jobs = overrides.jobs ?? createJobService({ metrics: jobMetrics });
  const workspace = overrides.workspace ?? createWorkspaceService({ policy });
  const chat = overrides.chat ?? createChatService({ policy, llm, usage });
  const providers = overrides.providers ?? createLlmProviderService({ llm });
  const analytics = overrides.analytics ?? createAdminSystemService({
    database: overrides.database ?? prisma,
    llm,
    queueTransport,
    enqueueValidation: (input, transport) => enqueueValidationJob(input, transport, jobs),
  });
  return { policy, workspace, chat, llm, providers, jobs, usage, jobMetrics, healthSamples, analytics };
}

export function createCoreAuthentication(services: CoreServices, database = prisma) {
  return createAuthenticate({ policy: services.policy, database });
}
