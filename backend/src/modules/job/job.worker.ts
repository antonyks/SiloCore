import type { JobServiceContract } from './job.service';
import type { JobWithMetadata, PgBoss } from 'pg-boss';
import type { Prisma } from '@prisma/client';
import { JobStatus } from '@prisma/client';
import { logger } from '../../config/logger';
import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';
import { InvalidInputError } from '../../errors';
import { SelectedJob } from './job.model';
import { JobService } from './job.service';
import { JobQueuePayload } from './job.types';

export const DEFAULT_WORKER_JOB_HEARTBEAT_INTERVAL_MS = 10_000;

export class JobWorkerCancelledError extends Error {
  constructor(jobId: number) {
    super(`Job ${jobId} was cancelled.`);
    this.name = 'JobWorkerCancelledError';
  }
}

export class JobWorkerShutdownError extends Error {
  constructor(jobId: number) {
    super(`Job ${jobId} was interrupted by worker shutdown.`);
    this.name = 'JobWorkerShutdownError';
  }
}

export interface JobWorkerContext {
  job: SelectedJob;
  payload: Prisma.JsonValue | null;
  signal: AbortSignal;
  heartbeat: () => Promise<void>;
  checkpointCancellation: () => Promise<void>;
}

export type JobWorkerHandler = (
  context: JobWorkerContext,
) => Promise<Prisma.InputJsonValue | undefined | void>;

export interface JobWorkerRunnerOptions {
  jobService?: JobServiceContract;
  heartbeatIntervalMs?: number;
  touchJob?: (queueName: string, queueMessageId: string) => Promise<void>;
}

export interface CreateJobWorkerHandlerOptions extends JobWorkerRunnerOptions {
  boss?: Pick<PgBoss, 'touch'>;
}

type JobWorkerFailurePhase =
  | 'queuePayload'
  | 'checkpointCancellation'
  | 'startAttempt'
  | 'handler'
  | 'markSucceeded'
  | 'markFailureState';

interface JobWorkerDiagnosticContext {
  phase: JobWorkerFailurePhase;
  jobId?: number;
}

const QUEUE_FAILURE_MESSAGES = {
  JOB_QUEUE_PAYLOAD_INVALID: 'Worker queue payload is invalid.',
  JOB_WORKER_INTERRUPTED: 'Job worker was interrupted.',
  JOB_HANDLER_FAILED: 'Job handler failed.',
  JOB_WORKER_STATE_FAILED: 'Job worker state update failed.',
} as const;

type QueueFailureCode = keyof typeof QUEUE_FAILURE_MESSAGES;

export function createJobWorkerHandler(
  handler: JobWorkerHandler,
  options: CreateJobWorkerHandlerOptions = {},
) {
  const touchJob = options.touchJob ?? createPgBossTouchJob(options.boss);

  return async (jobs: JobWithMetadata<JobQueuePayload>[]): Promise<void> => {
    let activeJob: JobWithMetadata<JobQueuePayload> | undefined;
    const diagnostic: JobWorkerDiagnosticContext = { phase: 'queuePayload' };

    try {
      for (const job of jobs) {
        activeJob = job;
        diagnostic.phase = 'queuePayload';
        diagnostic.jobId = undefined;
        await runJobWorkerWithDiagnostics(job, handler, {
          jobService: options.jobService,
          heartbeatIntervalMs: options.heartbeatIntervalMs,
          touchJob,
        }, diagnostic);
      }
    } catch (error: unknown) {
      const errorCode = queueFailureCode(error, diagnostic.phase, activeJob?.signal.aborted);
      const queueError = new Error(`${errorCode}: ${QUEUE_FAILURE_MESSAGES[errorCode]}`);
      queueError.name = 'JobWorkerQueueError';

      try {
        logger.error({
          operation: 'job.worker.run',
          status: 'error',
          errorCode,
          phase: diagnostic.phase,
          ...(diagnostic.jobId === undefined ? {} : { jobId: diagnostic.jobId }),
          ...(activeJob ? {
            queueName: activeJob.name,
            queueMessageId: activeJob.id,
            retryCount: activeJob.retryCount,
            retryLimit: activeJob.retryLimit,
          } : {}),
          ...safeErrorDiagnostic(error),
        }, 'Job worker failed.');
      } catch {
        // A logging failure must not pass the original error to pg-boss.
      }

      throw queueError;
    }
  };
}

export async function runJobWorker(
  queueJob: JobWithMetadata<JobQueuePayload>,
  handler: JobWorkerHandler,
  options: JobWorkerRunnerOptions = {},
): Promise<void> {
  return runJobWorkerWithDiagnostics(queueJob, handler, options);
}

async function runJobWorkerWithDiagnostics(
  queueJob: JobWithMetadata<JobQueuePayload>,
  handler: JobWorkerHandler,
  options: JobWorkerRunnerOptions,
  diagnostic?: JobWorkerDiagnosticContext,
): Promise<void> {
  const jobService = options.jobService ?? JobService;
  const jobId = parseQueueJobId(queueJob.data);
  if (diagnostic) diagnostic.jobId = jobId;
  let appJob: SelectedJob | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const heartbeat = async (): Promise<void> => {
    if (queueJob.signal.aborted) {
      throw new JobWorkerShutdownError(jobId);
    }

    await jobService.heartbeat(jobId);
    await options.touchJob?.(queueJob.name, queueJob.id);
  };

  const checkpointCancellation = async (): Promise<void> => {
    const currentJob = await jobService.checkpointCancellation(jobId);
    if (currentJob.status === JobStatus.CANCELLED) {
      throw new JobWorkerCancelledError(jobId);
    }
  };

  try {
    if (diagnostic) diagnostic.phase = 'checkpointCancellation';
    await checkpointCancellation();
    if (diagnostic) diagnostic.phase = 'startAttempt';
    appJob = await jobService.startWorkerAttempt(jobId);

    if (appJob.status === JobStatus.CANCELLED) {
      return;
    }

    if (isTerminalWorkerState(appJob.status)) {
      return;
    }

    if (diagnostic) diagnostic.phase = 'checkpointCancellation';
    await checkpointCancellation();
    heartbeatTimer = startHeartbeatLoop(
      options.heartbeatIntervalMs ?? DEFAULT_WORKER_JOB_HEARTBEAT_INTERVAL_MS,
      heartbeat,
      jobId,
    );

    if (diagnostic) diagnostic.phase = 'handler';
    const result = await handler({
      job: appJob,
      payload: appJob.payload,
      signal: queueJob.signal,
      heartbeat,
      checkpointCancellation,
    });

    if (queueJob.signal.aborted) {
      throw new JobWorkerShutdownError(jobId);
    }

    if (diagnostic) diagnostic.phase = 'checkpointCancellation';
    await checkpointCancellation();
    const persistedResult: Prisma.InputJsonValue | undefined =
      result === undefined ? undefined : result;
    if (diagnostic) diagnostic.phase = 'markSucceeded';
    await jobService.markSucceeded(jobId, persistedResult);
  } catch (error: unknown) {
    const failedPhase = diagnostic?.phase;
    if (error instanceof JobWorkerCancelledError) {
      return;
    }

    if (queueJob.signal.aborted || error instanceof JobWorkerShutdownError) {
      throw error;
    }

    if (diagnostic) diagnostic.phase = 'checkpointCancellation';
    const cancellationState = await jobService.checkpointCancellation(jobId);
    if (cancellationState.status === JobStatus.CANCELLED) {
      return;
    }

    if (diagnostic) diagnostic.phase = 'markFailureState';
    if (isFinalAttempt(appJob, queueJob)) {
      await jobService.markHandlerFailed(jobId);
    } else {
      await jobService.markRetryPending(jobId);
    }

    if (diagnostic && failedPhase) diagnostic.phase = failedPhase;
    throw error;
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  }
}

function queueFailureCode(
  error: unknown,
  phase: JobWorkerFailurePhase,
  signalAborted: boolean | undefined,
): QueueFailureCode {
  if (signalAborted || error instanceof JobWorkerShutdownError) return 'JOB_WORKER_INTERRUPTED';
  if (phase === 'queuePayload') return 'JOB_QUEUE_PAYLOAD_INVALID';
  if (phase === 'handler') return 'JOB_HANDLER_FAILED';
  return 'JOB_WORKER_STATE_FAILED';
}

function createPgBossTouchJob(
  boss: Pick<PgBoss, 'touch'> | undefined,
): JobWorkerRunnerOptions['touchJob'] {
  if (!boss) return undefined;

  return async (queueName: string, queueMessageId: string): Promise<void> => {
    await boss.touch(queueName, queueMessageId);
  };
}

function parseQueueJobId(payload: JobQueuePayload): number {
  const jobId = payload?.jobId;
  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    throw new InvalidInputError('Worker queue payload must include a valid jobId.', 'JOB_QUEUE_PAYLOAD_INVALID');
  }
  return jobId;
}

function isFinalAttempt(
  appJob: SelectedJob | null,
  queueJob: JobWithMetadata<JobQueuePayload>,
): boolean {
  if (appJob) {
    return appJob.attempts >= appJob.maxAttempts;
  }

  return queueJob.retryCount >= queueJob.retryLimit;
}

function isTerminalWorkerState(status: JobStatus): boolean {
  return status === JobStatus.SUCCEEDED ||
    status === JobStatus.FAILED ||
    status === JobStatus.CANCELLED;
}

function startHeartbeatLoop(
  heartbeatIntervalMs: number,
  heartbeat: () => Promise<void>,
  jobId: number,
): NodeJS.Timeout {
  return setInterval(() => {
    void heartbeat().catch((error) => {
      logger.warn(
        {
          jobId,
          operation: 'job.worker.heartbeat',
          ...safeErrorDiagnostic(error),
        },
        'Job worker heartbeat failed.',
      );
    });
  }, heartbeatIntervalMs);
}
