import { JobStatus } from '@prisma/client';
import { Response } from 'express';
import { logger } from '../../config/logger';
import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';
import { InvalidInputError } from '../../errors';
import { AuthenticatedRequest } from '../../types/authenticatedRequest';
import { JobServiceContract } from './job.service';
import { SelectedJobEvent } from './job.model';
import { jobNotificationListener } from './job.notifications';

const POLL_INTERVAL_MS = 5000;
const KEEPALIVE_INTERVAL_MS = 15000;
const RECENT_COMPLETION_MS = 15 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_ROWS_PER_GROUP_PER_SCAN = 500;
const MAX_PENDING_HINTS = 1000;
const HINT_BATCH_SIZE = 100;
const ACTIVE_STATUSES = [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.CANCEL_REQUESTED];
const TERMINAL_STATUSES = [JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED];
const VALID_STATUSES = new Set<string>(Object.values(JobStatus));

export interface JobEventFilters {
  types: string[];
  statuses: JobStatus[];
}

function parseList(value: unknown, name: string, maxLength: number, maxEntries: number): string[] {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new InvalidInputError(`A valid ${name} list is required.`);
  }
  const entries = value.split(',');
  if (entries.length > maxEntries || entries.some((entry) => entry.length === 0)) {
    throw new InvalidInputError(`A valid ${name} list is required.`);
  }
  return [...new Set(entries)];
}

export function parseJobEventFilters(query: AuthenticatedRequest['query']): JobEventFilters {
  const types = parseList(query.types, 'types', 2048, 16);
  if (types.some((type) => type.length > 128 || type.trim().length === 0 || type === '*' ||
    [...type].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) {
    throw new InvalidInputError('Job types must be exact, nonempty names of at most 128 characters.');
  }

  const statusNames = parseList(query.statuses, 'statuses', 128, 6);
  if (statusNames.some((status) => !VALID_STATUSES.has(status))) {
    throw new InvalidInputError('Job statuses must be valid durable status values.');
  }
  return { types, statuses: statusNames as JobStatus[] };
}

function writeEvent(res: Response, event: 'ready' | 'job', data: object): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function streamWorkspaceJobEvents(
  req: AuthenticatedRequest,
  res: Response,
  service: Pick<JobServiceContract, 'getJobEventsByIdsInWorkspace' | 'listJobEventsInWorkspace'>,
): void {
  const workspaceId = req.workspace?.id ?? 0;
  if (!workspaceId) throw new InvalidInputError('Workspace context is required');
  const filters = parseJobEventFilters(req.query);
  const typeSet = new Set(filters.types);
  const statusSet = new Set(filters.statuses);
  const activeStatuses = ACTIVE_STATUSES.filter((status) => statusSet.has(status));
  const terminalStatuses = TERMINAL_STATUSES.filter((status) => statusSet.has(status));
  const observedJobStatuses = new Set<string>();
  const pendingJobIds = new Set<number>();
  let activeCursor: number | undefined;
  let terminalCursor: { completedAt: Date; id: number } | undefined;
  let closed = false;
  let scanQueued = false;
  let hintsQueued = false;
  let work = Promise.resolve();

  function emitIfMatched(job: SelectedJobEvent): void {
    if (closed || !typeSet.has(job.type) || !statusSet.has(job.status)) return;
    const pair = `${job.id}:${job.status}`;
    if (observedJobStatuses.has(pair)) return;
    observedJobStatuses.add(pair);
    writeEvent(res, 'job', { jobId: job.id, type: job.type, status: job.status });
  }

  function queueWork(task: () => Promise<void>): void {
    work = work.then(async () => {
      if (!closed) await task();
    }).catch((error: unknown) => {
      logger.warn(
        { workspaceId, operation: 'job.events', ...safeErrorDiagnostic(error) },
        'Job event feed read failed; polling will retry.',
      );
    });
  }

  async function scanActiveJobs(): Promise<void> {
    if (activeStatuses.length === 0) return;
    let scanned = 0;
    while (!closed && scanned < MAX_ROWS_PER_GROUP_PER_SCAN) {
      const jobs = await service.listJobEventsInWorkspace({
        workspaceId,
        types: filters.types,
        statuses: activeStatuses,
        beforeId: activeCursor,
        limit: PAGE_SIZE,
      });
      for (const job of jobs) emitIfMatched(job);
      scanned += jobs.length;
      if (jobs.length < PAGE_SIZE) {
        activeCursor = undefined;
        return;
      }
      activeCursor = jobs[jobs.length - 1].id;
    }
  }

  async function scanCompletedJobs(): Promise<void> {
    if (terminalStatuses.length === 0) return;
    const completedSince = new Date(Date.now() - RECENT_COMPLETION_MS);
    let scanned = 0;
    while (!closed && scanned < MAX_ROWS_PER_GROUP_PER_SCAN) {
      const jobs = await service.listJobEventsInWorkspace({
        workspaceId,
        types: filters.types,
        statuses: terminalStatuses,
        completedSince,
        completedBefore: terminalCursor,
        limit: PAGE_SIZE,
      });
      for (const job of jobs) emitIfMatched(job);
      scanned += jobs.length;
      if (jobs.length < PAGE_SIZE) {
        terminalCursor = undefined;
        return;
      }
      const lastJob = jobs[jobs.length - 1];
      if (!lastJob.completedAt) {
        throw new Error('Completed job scan returned a job without completedAt.');
      }
      terminalCursor = { completedAt: lastJob.completedAt, id: lastJob.id };
    }
  }

  function scheduleScan(): void {
    if (closed || scanQueued) return;
    scanQueued = true;
    queueWork(async () => {
      try {
        await scanActiveJobs();
        await scanCompletedJobs();
      } finally {
        scanQueued = false;
      }
    });
  }

  function scheduleHints(): void {
    if (closed || hintsQueued) return;
    hintsQueued = true;
    queueWork(async () => {
      try {
        const jobIds = [...pendingJobIds].slice(0, HINT_BATCH_SIZE);
        for (const jobId of jobIds) pendingJobIds.delete(jobId);
        const jobs = await service.getJobEventsByIdsInWorkspace(jobIds, workspaceId);
        for (const job of jobs) emitIfMatched(job);
      } finally {
        hintsQueued = false;
        if (pendingJobIds.size > 0) scheduleHints();
      }
    });
  }

  const unsubscribe = jobNotificationListener.subscribeToCategories(({ jobId }) => {
    if (pendingJobIds.size < MAX_PENDING_HINTS || pendingJobIds.has(jobId)) {
      pendingJobIds.add(jobId);
      scheduleHints();
    } else {
      scheduleScan();
    }
  });

  const scanTimer = setInterval(scheduleScan, POLL_INTERVAL_MS);
  const keepaliveTimer = setInterval(() => {
    if (!closed) res.write(': keep-alive\n\n');
  }, KEEPALIVE_INTERVAL_MS);

  function close(): void {
    if (closed) return;
    closed = true;
    clearInterval(scanTimer);
    clearInterval(keepaliveTimer);
    unsubscribe();
    pendingJobIds.clear();
    observedJobStatuses.clear();
    req.off('aborted', close);
    res.off('close', close);
  }

  req.on('aborted', close);
  res.on('close', close);
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  writeEvent(res, 'ready', {});
  scheduleScan();
}
