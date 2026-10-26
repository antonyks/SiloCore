import { Prisma, JobStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { JobEventSelectFields, JobSelectFields, SelectedJob, SelectedJobEvent } from './job.model';

type JobRepositoryClient = Pick<Prisma.TransactionClient, 'job' | 'jobMetric' | '$queryRaw'>;
const TERMINAL_JOB_STATUSES = [
  JobStatus.SUCCEEDED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
];

export interface CreateQueuedJobData {
  workspaceId: number;
  createdByUserId: number;
  type: string;
  payload: Prisma.InputJsonValue;
  maxAttempts: number;
  stage: string;
}

export interface ListJobEventsInput {
  workspaceId: number;
  types: string[];
  statuses: JobStatus[];
  completedSince?: Date;
  beforeId?: number;
  completedBefore?: { completedAt: Date; id: number };
  limit: number;
}

export const JobRepository = {
  createQueuedJob(data: CreateQueuedJobData): Promise<SelectedJob> {
    return prisma.job.create({
      data: {
        workspaceId: data.workspaceId,
        createdByUserId: data.createdByUserId,
        type: data.type,
        status: JobStatus.QUEUED,
        payload: data.payload,
        maxAttempts: data.maxAttempts,
        stage: data.stage,
      },
      select: JobSelectFields,
    });
  },

  findById(id: number): Promise<SelectedJob | null> {
    return prisma.job.findUnique({
      where: { id },
      select: JobSelectFields,
    });
  },

  findByIdInWorkspace(id: number, workspaceId: number): Promise<SelectedJob | null> {
    return prisma.job.findFirst({
      where: {
        id,
        workspaceId,
      },
      select: JobSelectFields,
    });
  },

  findEventsByIdsInWorkspace(ids: number[], workspaceId: number): Promise<SelectedJobEvent[]> {
    return prisma.job.findMany({
      where: { id: { in: ids }, workspaceId },
      select: JobEventSelectFields,
    });
  },

  listJobEventsInWorkspace(input: ListJobEventsInput): Promise<SelectedJobEvent[]> {
    if (input.completedSince) {
      return prisma.job.findMany({
        where: {
          workspaceId: input.workspaceId,
          type: { in: input.types },
          status: { in: input.statuses },
          completedAt: { gte: input.completedSince },
          ...(input.completedBefore ? {
            OR: [
              { completedAt: { lt: input.completedBefore.completedAt } },
              {
                completedAt: input.completedBefore.completedAt,
                id: { lt: input.completedBefore.id },
              },
            ],
          } : {}),
        },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        take: input.limit,
        select: JobEventSelectFields,
      });
    }

    return prisma.job.findMany({
      where: {
        workspaceId: input.workspaceId,
        type: { in: input.types },
        status: { in: input.statuses },
        ...(input.beforeId ? { id: { lt: input.beforeId } } : {}),
      },
      orderBy: { id: 'desc' },
      take: input.limit,
      select: JobEventSelectFields,
    });
  },

  findQueuedJobsWithoutQueueMessage(
    limit: number,
    db: JobRepositoryClient = prisma,
  ): Promise<SelectedJob[]> {
    return db.job.findMany({
      where: {
        status: JobStatus.QUEUED,
        queueMessageId: null,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: JobSelectFields,
    });
  },

  findStaleRunningJobs(
    staleBefore: Date,
    limit: number,
    db: JobRepositoryClient = prisma,
  ): Promise<SelectedJob[]> {
    return db.job.findMany({
      where: {
        status: JobStatus.RUNNING,
        OR: [
          {
            heartbeatAt: {
              lt: staleBefore,
            },
          },
          {
            heartbeatAt: null,
            startedAt: {
              lt: staleBefore,
            },
          },
        ],
      },
      orderBy: { startedAt: 'asc' },
      take: limit,
      select: JobSelectFields,
    });
  },

  findLatestNonTerminalJobByType(
    type: string,
    db: JobRepositoryClient = prisma,
  ): Promise<SelectedJob | null> {
    return db.job.findFirst({
      where: {
        type,
        status: {
          notIn: TERMINAL_JOB_STATUSES,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: JobSelectFields,
    });
  },

  updateJob(
    id: number,
    data: Prisma.JobUpdateInput,
    db: JobRepositoryClient = prisma,
  ): Promise<SelectedJob> {
    return db.job.update({
      where: { id },
      data,
      select: JobSelectFields,
    });
  },

  runWithJobQueueReconciliationLock<T>(
    callback: (lockAcquired: boolean, db: JobRepositoryClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('silocore.job_queue_reconciliation', 0)) AS acquired
      `;

      return callback(result[0]?.acquired === true, tx);
    });
  },

  runWithStaleRunningJobRecoveryLock<T>(
    callback: (lockAcquired: boolean, db: JobRepositoryClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('silocore.stale_running_job_recovery', 0)) AS acquired
      `;

      return callback(result[0]?.acquired === true, tx);
    });
  },

  runWithProviderHealthSamplingEnqueueLock<T>(
    callback: (lockAcquired: boolean, db: JobRepositoryClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('silocore.provider_health_sampling_enqueue', 0)) AS acquired
      `;

      return callback(result[0]?.acquired === true, tx);
    });
  },
};
