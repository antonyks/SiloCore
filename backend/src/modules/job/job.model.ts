import { prisma } from '../../config/database';
import { Prisma, Job, JobStatus } from '@prisma/client';

export { Job, JobStatus };

export const JobSelectFields = {
  id: true,
  workspaceId: true,
  type: true,
  status: true,
  progress: true,
  stage: true,
  payload: true,
  result: true,
  errorCode: true,
  sanitizedError: true,
  attempts: true,
  maxAttempts: true,
  queueMessageId: true,
  createdByUserId: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  heartbeatAt: true,
  cancelRequestedAt: true,
} as const;

export type SelectedJob = Prisma.JobGetPayload<{
  select: typeof JobSelectFields;
}>;

export const JobModel = prisma.job;
