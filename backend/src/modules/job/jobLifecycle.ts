import { JobStatus } from '@prisma/client';
import { InvalidInputError } from '../../errors';

export const TERMINAL_JOB_STATUSES = [
  JobStatus.SUCCEEDED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
] as const;

const VALID_JOB_STATUS_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  [JobStatus.QUEUED]: [JobStatus.RUNNING, JobStatus.CANCEL_REQUESTED, JobStatus.FAILED],
  [JobStatus.RUNNING]: [
    JobStatus.CANCEL_REQUESTED,
    JobStatus.SUCCEEDED,
    JobStatus.FAILED,
  ],
  [JobStatus.CANCEL_REQUESTED]: [JobStatus.CANCELLED, JobStatus.FAILED],
  [JobStatus.CANCELLED]: [],
  [JobStatus.SUCCEEDED]: [],
  [JobStatus.FAILED]: [],
};

export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status as (typeof TERMINAL_JOB_STATUSES)[number]);
}

export function assertValidJobStatusTransition(from: JobStatus, to: JobStatus): void {
  if (from === to) return;

  if (!VALID_JOB_STATUS_TRANSITIONS[from].includes(to)) {
    throw new InvalidInputError(
      `Invalid job status transition from ${from} to ${to}.`,
      'JOB_STATUS_TRANSITION_INVALID',
    );
  }
}

export function assertValidJobProgress(progress: number): void {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new InvalidInputError(
      'Job progress must be an integer from 0 to 100.',
      'JOB_PROGRESS_INVALID',
    );
  }
}
