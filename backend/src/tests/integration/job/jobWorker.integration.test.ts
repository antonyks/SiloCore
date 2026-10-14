import type { JobWithMetadata } from 'pg-boss';
import { JobStatus, WorkspaceType } from '@prisma/client';
import { ENV } from '../../../config/env';
import { createJobWorkerHandler, JobQueuePayload, runJobWorker } from '../../../modules/job';
import { importPgBoss } from '../../../modules/job/pgBoss.loader.cjs';
import {
  createIntegrationTestUser,
  integrationPrisma,
  resetIntegrationDatabase,
} from '../helpers/prisma';

function createQueueJob(
  jobId: number,
  overrides: Partial<JobWithMetadata<JobQueuePayload>> = {},
): JobWithMetadata<JobQueuePayload> {
  const abortController = new AbortController();
  const now = new Date('2026-01-01T00:00:00.000Z');

  return {
    id: `pgboss-${jobId}`,
    name: 'validation.fixture',
    data: { jobId },
    expireInSeconds: 900,
    heartbeatSeconds: null,
    signal: abortController.signal,
    priority: 0,
    state: 'active',
    retryLimit: 2,
    retryCount: 0,
    retryDelay: 0,
    retryBackoff: false,
    startAfter: now,
    startedOn: now,
    singletonKey: null,
    singletonOn: null,
    deleteAfterSeconds: 60,
    createdOn: now,
    completedOn: null,
    keepUntil: now,
    policy: 'standard',
    heartbeatOn: null,
    blocked: false,
    blocking: false,
    pendingDependencies: 0,
    deadLetter: '',
    output: {},
    sourceName: null,
    sourceId: null,
    sourceCreatedOn: null,
    sourceRetryCount: null,
    ...overrides,
  } as JobWithMetadata<JobQueuePayload>;
}

beforeEach(async () => {
  await resetIntegrationDatabase();
});

async function createJobOwnerAndWorkspace() {
  const owner = await createIntegrationTestUser();
  const workspace = await integrationPrisma.workspace.create({
    data: {
      name: 'Job Worker Workspace',
      type: WorkspaceType.STANDARD,
      ownerUserId: owner.id,
    },
  });

  return { owner, workspace };
}

async function createQueuedJob(maxAttempts = 3) {
  const { owner, workspace } = await createJobOwnerAndWorkspace();
  return integrationPrisma.job.create({
    data: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      type: 'validation.fixture',
      payload: { operationId: 'worker-lifecycle' },
      queueMessageId: 'pgboss-test',
      maxAttempts,
    },
  });
}

describe('Job worker lifecycle integration', () => {
  it('stores only fixed failure details in pg-boss output after a real retry', async () => {
    const { PgBoss } = await importPgBoss();
    const queueName = 'job-worker-privacy-integration';
    const boss = new PgBoss({
      connectionString: ENV.DATABASE_URL,
      schema: ENV.PGBOSS_SCHEMA,
      migrate: true,
      createSchema: true,
      supervise: false,
      schedule: false,
    });
    const job = await createQueuedJob(2);
    const handler = jest.fn(async () => {
      throw Object.assign(new Error('prompt=private-conversation; Bearer secret-test-token'), {
        cause: new Error('x-api-key=private-test-key'),
      });
    });

    await boss.start();
    try {
      await boss.createQueue(queueName, { retryLimit: 1, retryDelay: 0 });
      const queueMessageId = await boss.send(queueName, { jobId: job.id }, {
        retryLimit: 1,
        retryDelay: 0,
      });
      expect(queueMessageId).not.toBeNull();
      if (!queueMessageId) throw new Error('pg-boss did not enqueue the integration job.');
      await integrationPrisma.job.update({
        where: { id: job.id },
        data: { queueMessageId },
      });
      await boss.work(queueName, {
        includeMetadata: true,
        localConcurrency: 1,
        pollingInterval: 100,
        notifyPollingInterval: 100,
      }, createJobWorkerHandler(handler, { boss }));

      const deadline = Date.now() + 15_000;
      let queueJob = await boss.getJobById<JobQueuePayload>(queueName, queueMessageId);
      while (queueJob?.state !== 'failed' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        queueJob = await boss.getJobById<JobQueuePayload>(queueName, queueMessageId);
      }

      expect(queueJob?.state).toBe('failed');
      expect(queueJob?.retryCount).toBe(1);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(queueJob?.output)).toContain('JOB_HANDLER_FAILED: Job handler failed.');
      expect(JSON.stringify(queueJob?.output)).not.toMatch(/private-conversation|secret-test-token|private-test-key/);

      const appJob = await integrationPrisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(appJob).toMatchObject({
        status: JobStatus.FAILED,
        attempts: 2,
        errorCode: 'JOB_HANDLER_FAILED',
        sanitizedError: 'Job handler failed.',
      });
      expect(JSON.stringify(appJob)).not.toMatch(/private-conversation|secret-test-token|private-test-key/);
    } finally {
      await boss.stop({ graceful: true, close: true, timeout: 5000 });
    }
  });

  it('records worker pickup and successful completion in durable app state', async () => {
    const job = await createQueuedJob(2);

    await runJobWorker(createQueueJob(job.id), async ({ job: appJob }) => {
      expect(appJob.id).toBe(job.id);
      return { processedCount: 1 };
    });

    await expect(
      integrationPrisma.job.findUniqueOrThrow({ where: { id: job.id } }),
    ).resolves.toMatchObject({
      status: JobStatus.SUCCEEDED,
      attempts: 1,
      progress: 100,
      stage: 'completed',
      result: { processedCount: 1 },
    });
  });

  it('keeps non-final handler failures retry pending for pg-boss retry', async () => {
    const job = await createQueuedJob(3);

    await expect(
      runJobWorker(createQueueJob(job.id), async () => {
        throw new Error('raw retry failure');
      }),
    ).rejects.toThrow('raw retry failure');

    await expect(
      integrationPrisma.job.findUniqueOrThrow({ where: { id: job.id } }),
    ).resolves.toMatchObject({
      status: JobStatus.RUNNING,
      attempts: 1,
      stage: 'retry_pending',
      errorCode: null,
      sanitizedError: null,
    });
  });

  it('marks exhausted handler failures failed with sanitized details', async () => {
    const job = await createQueuedJob(1);

    await expect(
      runJobWorker(createQueueJob(job.id, { retryCount: 0, retryLimit: 0 }), async () => {
        throw new Error('password=secret final failure');
      }),
    ).rejects.toThrow('password=secret final failure');

    const failedJob = await integrationPrisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(failedJob).toMatchObject({
      status: JobStatus.FAILED,
      attempts: 1,
      stage: 'failed',
      errorCode: 'JOB_HANDLER_FAILED',
      sanitizedError: 'Job handler failed.',
    });
    expect(JSON.stringify(failedJob)).not.toContain('secret');
  });

  it('persists explicit heartbeat checkpoints during work', async () => {
    const job = await createQueuedJob(2);
    const touchJob = jest.fn(async () => undefined);

    await runJobWorker(
      createQueueJob(job.id),
      async ({ heartbeat }) => {
        await heartbeat();
        return undefined;
      },
      { touchJob },
    );

    const completedJob = await integrationPrisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(completedJob.status).toBe(JobStatus.SUCCEEDED);
    expect(completedJob.heartbeatAt).not.toBeNull();
    expect(touchJob).toHaveBeenCalledWith('validation.fixture', `pgboss-${job.id}`);
  });

  it('turns cancellation checkpoints into durable cancellation without retry', async () => {
    const job = await createQueuedJob(2);
    await integrationPrisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.CANCEL_REQUESTED,
        stage: 'cancellation_requested',
        cancelRequestedAt: new Date(),
      },
    });

    const handler = jest.fn();
    await expect(runJobWorker(createQueueJob(job.id), handler)).resolves.toBeUndefined();

    expect(handler).not.toHaveBeenCalled();
    await expect(
      integrationPrisma.job.findUniqueOrThrow({ where: { id: job.id } }),
    ).resolves.toMatchObject({
      status: JobStatus.CANCELLED,
      stage: 'cancelled',
      attempts: 0,
    });
  });
});
