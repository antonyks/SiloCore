jest.mock('node-fetch', () => jest.fn());
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

import type { JobWithMetadata } from 'pg-boss';
import { JobStatus } from '@prisma/client';
import { createWorkerComposition, WorkerQueueClient } from '../../composition/worker';
import { createCoreServices } from '../../composition/coreServices';
import { createApiComposition } from '../../composition/api';
import { ApiQueueClient, createJobQueueClient } from '../../modules/job/jobQueue.client';
import { WorkerCpuTaskPool } from '../../modules/worker/workerTaskPool';
import { VALIDATION_JOB_QUEUE } from '../../modules/worker/validationJob';
import { PROVIDER_HEALTH_SAMPLING_JOB_QUEUE } from '../../modules/worker/providerHealthSamplingJob';
import { SelectedJob } from '../../modules/job/job.model';
import { JobQueuePayload } from '../../modules/job/job.types';

function fixture() {
  const order: string[] = [];
  const callbacks = new Map<string, (jobs: JobWithMetadata<JobQueuePayload>[]) => Promise<void>>();
  const job: SelectedJob = {
    id: 5, workspaceId: 2, createdByUserId: 1, type: VALIDATION_JOB_QUEUE,
    status: JobStatus.RUNNING, progress: 0, stage: 'running', payload: {}, result: null,
    errorCode: null, sanitizedError: null, attempts: 1, maxAttempts: 2,
    queueMessageId: 'message', createdAt: new Date(), startedAt: new Date(),
    completedAt: null, heartbeatAt: null, cancelRequestedAt: null,
  };
  const jobs = {
    ...createCoreServices().jobs,
    reconcileQueuedJobsWithoutQueueMessage: jest.fn(async () => ({ skipped: false, scanned: 0, reenqueued: 0, failed: 0 })),
    recoverStaleRunningJobs: jest.fn(async () => ({ skipped: false, scanned: 0, requeued: 0, failed: 0 })),
    checkpointCancellation: jest.fn(async () => job),
    startWorkerAttempt: jest.fn(async () => job),
    heartbeat: jest.fn(async () => job),
    updateProgress: jest.fn(async () => job),
    markSucceeded: jest.fn(async () => job),
    markRetryPending: jest.fn(async () => job),
    markHandlerFailed: jest.fn(async () => job),
  };
  const queue = {
    on: jest.fn(),
    start: jest.fn(async (): Promise<void> => undefined),
    stop: jest.fn(async () => { order.push('queue'); }),
    createQueue: jest.fn(async () => undefined),
    send: jest.fn(async () => 'message'),
    touch: jest.fn(async () => undefined),
    work: jest.fn(async (name, _options, handler) => { callbacks.set(name, handler); }),
  };
  const pool = {
    run: jest.fn(async () => ({ checksum: 'checksum', iterations: 25000, seedLength: 20 })),
    close: jest.fn(async () => { order.push('pool'); }),
    destroy: jest.fn(async () => undefined),
  };
  const stopScheduler = jest.fn(() => { order.push('scheduler'); });
  const createQueueClient = jest.fn(async () => queue as unknown as WorkerQueueClient);
  const createCpuPool = jest.fn(() => pool as WorkerCpuTaskPool);
  const startScheduler = jest.fn(() => ({ stop: stopScheduler }));
  return { order, callbacks, job, jobs, queue, pool, createQueueClient, createCpuPool, startScheduler, stopScheduler };
}

describe('worker composition', () => {
  it('constructs lazily, wires handlers to injected jobs and CPU pool, and shuts down in order', async () => {
    const f = fixture();
    const worker = createWorkerComposition({ ...f });
    expect(f.createCpuPool).not.toHaveBeenCalled();
    expect(f.createQueueClient).not.toHaveBeenCalled();
    expect(f.startScheduler).not.toHaveBeenCalled();
    await Promise.all([worker.start(), worker.start()]);
    expect(f.queue.start).toHaveBeenCalledTimes(1);
    expect([...f.callbacks.keys()]).toEqual([VALIDATION_JOB_QUEUE, PROVIDER_HEALTH_SAMPLING_JOB_QUEUE]);
    const queueJob = {
      id: 'message', name: VALIDATION_JOB_QUEUE, data: { jobId: 5 },
      signal: new AbortController().signal, retryCount: 0, retryLimit: 1,
    } as JobWithMetadata<JobQueuePayload>;
    await f.callbacks.get(VALIDATION_JOB_QUEUE)!([queueJob]);
    expect(f.jobs.updateProgress).toHaveBeenCalledWith(5, 25, 'validation_preparing');
    expect(f.pool.run).toHaveBeenCalledTimes(1);
    expect(f.jobs.markSucceeded).toHaveBeenCalledWith(5, expect.objectContaining({ checksum: 'checksum' }));
    expect(f.jobs.reconcileQueuedJobsWithoutQueueMessage).toHaveBeenCalledTimes(1);
    expect(f.jobs.recoverStaleRunningJobs).toHaveBeenCalledTimes(1);
    await worker.stop();
    await worker.stop();
    expect(f.order).toEqual(['scheduler', 'queue', 'pool']);
  });

  it('uses replacement handler registrations and keeps compositions separate', async () => {
    const a = fixture();
    const b = fixture();
    const handler = jest.fn(async () => ({ replaced: true }));
    const workerA = createWorkerComposition({ ...a, handlers: () => [{ queueName: 'replacement', handler }] });
    const workerB = createWorkerComposition({ ...b });
    await workerA.start();
    await workerB.start();
    expect([...a.callbacks.keys()]).toEqual(['replacement']);
    expect([...b.callbacks.keys()]).toEqual([VALIDATION_JOB_QUEUE, PROVIDER_HEALTH_SAMPLING_JOB_QUEUE]);
    await a.callbacks.get('replacement')!([{
      id: 'message', name: 'replacement', data: { jobId: 5 }, signal: new AbortController().signal,
    } as JobWithMetadata<JobQueuePayload>]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(a.jobs.markSucceeded).toHaveBeenCalledWith(5, { replaced: true });
    expect(b.jobs.markSucceeded).not.toHaveBeenCalled();
    await workerA.stop();
    await workerB.stop();
  });

  it('cleans up partial startup and preserves its original failure', async () => {
    const f = fixture();
    const failure = new Error('queue start failed');
    f.queue.start.mockRejectedValue(failure);
    const worker = createWorkerComposition({ ...f });
    await expect(worker.start()).rejects.toBe(failure);
    expect(f.queue.stop).toHaveBeenCalledTimes(1);
    expect(f.pool.close).toHaveBeenCalledTimes(1);
    expect(f.startScheduler).not.toHaveBeenCalled();
  });

  it('waits for in-progress startup before disposing resources', async () => {
    const f = fixture();
    let release!: () => void;
    f.queue.start.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const worker = createWorkerComposition({ ...f });
    const starting = worker.start();
    await Promise.resolve();
    const stopping = worker.stop();
    expect(f.queue.stop).not.toHaveBeenCalled();
    release();
    await Promise.all([starting, stopping]);
    expect(f.order).toEqual(['scheduler', 'queue', 'pool']);
  });

  it('still closes the CPU pool after queue shutdown fails and destroys a pool that cannot close', async () => {
    const f = fixture();
    const queueFailure = new Error('queue stop failed');
    f.queue.stop.mockRejectedValue(queueFailure);
    f.pool.close.mockRejectedValue(new Error('pool close failed'));
    const worker = createWorkerComposition({ ...f });
    await worker.start();
    await expect(worker.stop()).rejects.toBe(queueFailure);
    expect(f.pool.destroy).toHaveBeenCalledTimes(1);
  });

  it.each(['synchronous', 'asynchronous'] as const)(
    'cleans up after scheduler stop failure (%s) and clears resources for restart',
    async (mode) => {
      const f = fixture();
      const failure = new Error('scheduler stop failed');
      f.stopScheduler.mockImplementationOnce(() => {
        f.order.push('scheduler');
        if (mode === 'asynchronous') return Promise.reject(failure);
        throw failure;
      });
      const worker = createWorkerComposition({ ...f });
      await worker.start();

      const stopping = worker.stop();
      expect(worker.stop()).toBe(stopping);
      await expect(stopping).rejects.toBe(failure);
      expect(f.order).toEqual(['scheduler', 'queue', 'pool']);
      await expect(worker.stop()).resolves.toBeUndefined();
      expect(f.stopScheduler).toHaveBeenCalledTimes(1);
      expect(f.queue.stop).toHaveBeenCalledTimes(1);
      expect(f.pool.close).toHaveBeenCalledTimes(1);

      await worker.start();
      expect(f.createQueueClient).toHaveBeenCalledTimes(2);
      expect(f.createCpuPool).toHaveBeenCalledTimes(2);
      expect(f.startScheduler).toHaveBeenCalledTimes(2);
      await worker.stop();
      expect(f.order).toEqual(['scheduler', 'queue', 'pool', 'scheduler', 'queue', 'pool']);
    },
  );

  it('preserves the scheduler error when queue and pool shutdown also fail and destroys the pool', async () => {
    const f = fixture();
    const failure = new Error('scheduler stop failed');
    f.stopScheduler.mockImplementation(() => { throw failure; });
    f.queue.stop.mockRejectedValue(new Error('queue stop failed'));
    f.pool.close.mockRejectedValue(new Error('pool close failed'));
    const worker = createWorkerComposition({ ...f });
    await worker.start();

    await expect(worker.stop()).rejects.toBe(failure);
    expect(f.queue.stop).toHaveBeenCalledTimes(1);
    expect(f.pool.close).toHaveBeenCalledTimes(1);
    expect(f.pool.destroy).toHaveBeenCalledTimes(1);
    await expect(worker.stop()).resolves.toBeUndefined();
    expect(f.stopScheduler).toHaveBeenCalledTimes(1);
    expect(f.queue.stop).toHaveBeenCalledTimes(1);
    expect(f.pool.close).toHaveBeenCalledTimes(1);
    expect(f.pool.destroy).toHaveBeenCalledTimes(1);
  });

  it('preserves a startup failure while cleaning up after scheduler stop fails', async () => {
    const f = fixture();
    const failure = new Error('reconciliation failed');
    f.jobs.reconcileQueuedJobsWithoutQueueMessage.mockRejectedValueOnce(failure);
    f.stopScheduler.mockImplementationOnce(() => {
      f.order.push('scheduler');
      throw new Error('scheduler stop failed');
    });
    const worker = createWorkerComposition({ ...f });

    await expect(worker.start()).rejects.toBe(failure);
    expect(f.startScheduler).toHaveBeenCalledTimes(1);
    expect(f.order).toEqual(['scheduler', 'queue', 'pool']);
    await expect(worker.stop()).resolves.toBeUndefined();
    expect(f.stopScheduler).toHaveBeenCalledTimes(1);
    expect(f.queue.stop).toHaveBeenCalledTimes(1);
    expect(f.pool.close).toHaveBeenCalledTimes(1);

    await worker.start();
    expect(f.jobs.reconcileQueuedJobsWithoutQueueMessage).toHaveBeenCalledTimes(2);
    await worker.stop();
  });
});

describe('API queue composition', () => {
  it('waits for in-progress queue startup before stopping and clears its transport', async () => {
    const f = fixture();
    let release!: () => void;
    f.queue.start.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const client = createJobQueueClient(undefined, async () => f.queue as unknown as ApiQueueClient);
    const starting = client.start();
    await Promise.resolve();
    const stopping = client.stop();
    expect(f.queue.stop).not.toHaveBeenCalled();
    release();
    await Promise.all([starting, stopping]);
    expect(f.queue.stop).toHaveBeenCalledTimes(1);
    expect(() => client.getTransport()).toThrow('has not been started');
  });
  it('does not start a client during construction and cleans up failed queue startup', async () => {
    const f = fixture();
    const createClient = jest.fn(async () => f.queue as unknown as ApiQueueClient);
    const client = createJobQueueClient(undefined, createClient);
    const api = createApiComposition({}, client);
    expect(createClient).not.toHaveBeenCalled();
    expect(() => client.getTransport()).toThrow('has not been started');
    await Promise.all([api.start(), api.start()]);
    expect(createClient).toHaveBeenCalledTimes(1);
    await api.stop();
    const failure = new Error('api queue start failed');
    f.queue.start.mockRejectedValue(failure);
    await expect(api.start()).rejects.toBe(failure);
    expect(f.queue.stop).toHaveBeenCalledTimes(2);
  });
});
