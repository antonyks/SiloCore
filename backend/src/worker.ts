import dotenv from 'dotenv';
dotenv.config();

import { ENV } from './config/env';
import { connectDatabase, prisma } from './config/database';
import { logger } from './config/logger';
import { createWorkerComposition } from './composition/worker';

const composition = createWorkerComposition();
let shutdownStarted = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shutdownStarted) return;
  shutdownStarted = true;

  logger.info({ signal }, 'Worker shutdown requested.');

  let shutdownError: unknown;

  try {
    await composition.stop();
  } catch (error: unknown) {
    shutdownError = error;
  }

  try {
    await prisma.$disconnect();
  } catch (error: unknown) {
    shutdownError ??= error;
  }

  if (shutdownError) {
    logger.error({ signal, err: shutdownError }, 'Worker shutdown failed.');
    process.exit(1);
  }

  logger.info({ signal }, 'Worker stopped cleanly.');
  process.exit(0);
}

async function startWorker() {
  try {
    await connectDatabase();
    const { jobQueueReconciliation, staleRunningJobRecovery } = await composition.start();

    logger.info(
      {
        workerConcurrency: ENV.WORKER_CONCURRENCY,
        piscinaThreadCount: ENV.PISCINA_THREAD_COUNT,
        workerShutdownGraceMs: ENV.WORKER_SHUTDOWN_GRACE_MS,
        workerJobHeartbeatIntervalMs: ENV.WORKER_JOB_HEARTBEAT_INTERVAL_MS,
        workerStaleJobMs: ENV.WORKER_STALE_JOB_MS,
        providerHealthSampleIntervalMs: ENV.PROVIDER_HEALTH_SAMPLE_INTERVAL_MS,
        pgBossSchema: ENV.PGBOSS_SCHEMA,
        jobQueueReconciliation,
        staleRunningJobRecovery,
      },
      'Worker started with job lifecycle execution infrastructure, validation job handler and provider health sampling handler.',
    );
  } catch (error: unknown) {
    logger.error(
      { err: error, pgBossSchema: ENV.PGBOSS_SCHEMA },
      'Worker failed to start.',
    );
    await composition.stop().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void startWorker();
