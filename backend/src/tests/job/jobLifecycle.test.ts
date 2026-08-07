import { JobStatus } from '@prisma/client';
import { InvalidInputError } from '../../errors';
import {
  assertValidJobProgress,
  assertValidJobStatusTransition,
  isTerminalJobStatus,
} from '../../modules/job';

describe('job lifecycle helpers', () => {
  it.each([
    [JobStatus.QUEUED, JobStatus.RUNNING],
    [JobStatus.QUEUED, JobStatus.CANCEL_REQUESTED],
    [JobStatus.QUEUED, JobStatus.FAILED],
    [JobStatus.RUNNING, JobStatus.CANCEL_REQUESTED],
    [JobStatus.RUNNING, JobStatus.SUCCEEDED],
    [JobStatus.RUNNING, JobStatus.FAILED],
    [JobStatus.CANCEL_REQUESTED, JobStatus.CANCELLED],
    [JobStatus.CANCEL_REQUESTED, JobStatus.FAILED],
  ])('allows %s -> %s', (from, to) => {
    expect(() => assertValidJobStatusTransition(from, to)).not.toThrow();
  });

  it.each([
    [JobStatus.QUEUED, JobStatus.SUCCEEDED],
    [JobStatus.QUEUED, JobStatus.CANCELLED],
    [JobStatus.SUCCEEDED, JobStatus.FAILED],
    [JobStatus.FAILED, JobStatus.RUNNING],
    [JobStatus.CANCELLED, JobStatus.RUNNING],
  ])('rejects %s -> %s', (from, to) => {
    expect(() => assertValidJobStatusTransition(from, to)).toThrow(InvalidInputError);
  });

  it('allows idempotent same-status transitions', () => {
    expect(() =>
      assertValidJobStatusTransition(JobStatus.RUNNING, JobStatus.RUNNING),
    ).not.toThrow();
  });

  it('identifies terminal statuses', () => {
    expect(isTerminalJobStatus(JobStatus.SUCCEEDED)).toBe(true);
    expect(isTerminalJobStatus(JobStatus.FAILED)).toBe(true);
    expect(isTerminalJobStatus(JobStatus.CANCELLED)).toBe(true);
    expect(isTerminalJobStatus(JobStatus.RUNNING)).toBe(false);
  });

  it.each([0, 1, 50, 100])('accepts progress %s', (progress) => {
    expect(() => assertValidJobProgress(progress)).not.toThrow();
  });

  it.each([-1, 101, 1.5, Number.NaN])('rejects invalid progress %s', (progress) => {
    expect(() => assertValidJobProgress(progress)).toThrow(InvalidInputError);
  });
});
