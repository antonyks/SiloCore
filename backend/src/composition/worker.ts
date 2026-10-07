import type { PgBoss } from 'pg-boss';
import { ENV } from '../config/env';
import { logger } from '../config/logger';
import { createJobWorkerHandler, JobWorkerHandler } from '../modules/job/job.worker';
import { ensurePgBossQueue, PgBossJobQueueTransport } from '../modules/job/jobQueue.transport';
import { importPgBoss } from '../modules/job/pgBoss.loader.cjs';
import { createValidationJobHandler, VALIDATION_JOB_QUEUE } from '../modules/worker/validationJob';
import { createProviderHealthSampling, PROVIDER_HEALTH_SAMPLING_JOB_QUEUE, ProviderHealthSamplingScheduler } from '../modules/worker/providerHealthSamplingJob';
import { createWorkerCpuTaskPool, WorkerCpuTaskPool } from '../modules/worker/workerTaskPool';
import { CoreServices, CoreServiceOverrides, createCoreServices } from './coreServices';

export type WorkerQueueClient = Pick<PgBoss, 'on' | 'start' | 'stop' | 'work' | 'send' | 'createQueue' | 'touch'>;

export interface JobHandlerRegistration {
  queueName: string;
  handler: JobWorkerHandler;
}

export interface WorkerCompositionOverrides extends CoreServiceOverrides {
  createQueueClient?: () => Promise<WorkerQueueClient>;
  createCpuPool?: typeof createWorkerCpuTaskPool;
  handlers?: (services: CoreServices, pool: WorkerCpuTaskPool) => readonly JobHandlerRegistration[];
  startScheduler?: ReturnType<typeof createProviderHealthSampling>['startProviderHealthSamplingScheduler'];
}

/** Every resource belongs to this composition and is created only by start(). */
export function createWorkerComposition(overrides: WorkerCompositionOverrides = {}) {
  const services = createCoreServices(overrides);
  const sampling = createProviderHealthSampling({ jobService: services.jobs, llm: services.llm });
  let boss: WorkerQueueClient | undefined;
  let pool: WorkerCpuTaskPool | undefined;
  let scheduler: ProviderHealthSamplingScheduler | undefined;
  let startPromise: Promise<WorkerStartupResult> | undefined;
  let stopPromise: Promise<void> | undefined;
  let started: WorkerStartupResult | undefined;

  function registrations(cpuPool: WorkerCpuTaskPool): readonly JobHandlerRegistration[] {
    return overrides.handlers?.(services, cpuPool) ?? [
      { queueName: VALIDATION_JOB_QUEUE, handler: createValidationJobHandler(cpuPool, services.jobs) },
      { queueName: PROVIDER_HEALTH_SAMPLING_JOB_QUEUE, handler: sampling.createProviderHealthSamplingJobHandler() },
    ];
  }

  async function startResources() {
    try {
      pool = (overrides.createCpuPool ?? createWorkerCpuTaskPool)({ threadCount: ENV.PISCINA_THREAD_COUNT });
      boss = await (overrides.createQueueClient ?? createCoreWorkerQueueClient)();
      boss.on('error', (error) => logger.error({ err: error }, 'pg-boss emitted an error.'));
      boss.on('warning', (warning) => logger.warn({ warning }, 'pg-boss emitted a warning.'));
      await boss.start();
      const handlers = registrations(pool);
      for (const { queueName } of handlers) await ensurePgBossQueue(boss, queueName);
      for (const { queueName, handler } of handlers) {
        await boss.work(queueName, {
          includeMetadata: true,
          localConcurrency: ENV.WORKER_CONCURRENCY,
        }, createJobWorkerHandler(handler, {
          boss,
          jobService: services.jobs,
          heartbeatIntervalMs: ENV.WORKER_JOB_HEARTBEAT_INTERVAL_MS,
        }));
      }
      const transport = new PgBossJobQueueTransport(boss);
      scheduler = (overrides.startScheduler ?? sampling.startProviderHealthSamplingScheduler)({
        intervalMs: ENV.PROVIDER_HEALTH_SAMPLE_INTERVAL_MS,
        queueTransport: transport,
      });
      const jobQueueReconciliation = await services.jobs.reconcileQueuedJobsWithoutQueueMessage(transport);
      const staleRunningJobRecovery = await services.jobs.recoverStaleRunningJobs(transport, {
        staleJobMs: ENV.WORKER_STALE_JOB_MS,
      });
      started = { jobQueueReconciliation, staleRunningJobRecovery };
      return started;
    } catch (error) {
      await disposeResources().catch(() => undefined);
      throw error;
    }
  }

  function start(): Promise<WorkerStartupResult> {
    if (stopPromise) return stopPromise.then(start);
    if (started) return Promise.resolve(started);
    if (startPromise) return startPromise;
    startPromise = startResources().finally(() => { startPromise = undefined; });
    return startPromise;
  }

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      await startPromise?.catch(() => undefined);
      await disposeResources();
    })().finally(() => { stopPromise = undefined; });
    return stopPromise;
  }

  async function disposeResources(): Promise<void> {
    const healthScheduler = scheduler;
    const queue = boss;
    const cpuPool = pool;
    scheduler = undefined;
    boss = undefined;
    pool = undefined;
    started = undefined;
    let failure: unknown;
    try {
      await healthScheduler?.stop();
    } catch (error) {
      failure = error;
    }
    try {
      await queue?.stop({ graceful: true, close: true, timeout: ENV.WORKER_SHUTDOWN_GRACE_MS });
    } catch (error) {
      failure ??= error;
    }
    try {
      await cpuPool?.close();
    } catch (error) {
      await cpuPool?.destroy().catch(() => undefined);
      failure ??= error;
    }
    if (failure) throw failure;
  }

  return { services, start, stop };
}

type WorkerStartupResult = {
  jobQueueReconciliation: Awaited<ReturnType<CoreServices['jobs']['reconcileQueuedJobsWithoutQueueMessage']>>;
  staleRunningJobRecovery: Awaited<ReturnType<CoreServices['jobs']['recoverStaleRunningJobs']>>;
};

async function createCoreWorkerQueueClient(): Promise<WorkerQueueClient> {
  const { PgBoss } = await importPgBoss();
  return new PgBoss({
    connectionString: ENV.DATABASE_URL,
    schema: ENV.PGBOSS_SCHEMA,
    migrate: true,
    createSchema: true,
    supervise: true,
    schedule: false,
  });
}
