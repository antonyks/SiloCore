import { EventEmitter } from 'node:events';
import { JobStatus } from '@prisma/client';
import { parseJobEventFilters, streamWorkspaceJobEvents } from '../../modules/job/job.events';
import { jobNotificationListener } from '../../modules/job/job.notifications';
import { AuthenticatedRequest } from '../../types/authenticatedRequest';
import { JobServiceContract } from '../../modules/job/job.service';

function createStream() {
  const request = Object.assign(new EventEmitter(), {
    workspace: { id: 25 },
    query: { types: 'chat.session_title', statuses: 'SUCCEEDED,FAILED' },
  }) as unknown as AuthenticatedRequest;
  const response = Object.assign(new EventEmitter(), {
    status: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    writableEnded: false,
  });
  response.status.mockReturnValue(response);
  return { request, response };
}

describe('workspace job events', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('requires bounded, exact type and durable status lists', () => {
    expect(parseJobEventFilters({
      types: 'chat.session_title, validation.fixture,chat.session_title',
      statuses: 'SUCCEEDED,FAILED,SUCCEEDED',
    })).toEqual({
      types: ['chat.session_title', ' validation.fixture'],
      statuses: [JobStatus.SUCCEEDED, JobStatus.FAILED],
    });
    for (const query of [
      { statuses: 'SUCCEEDED' },
      { types: 'chat.session_title' },
      { types: '*', statuses: 'SUCCEEDED' },
      { types: ' ', statuses: 'SUCCEEDED' },
      { types: 'chat.session_title,', statuses: 'SUCCEEDED' },
      { types: 'chat.session_title', statuses: 'succeeded' },
      { types: 'chat.session_title', statuses: 'SUCCEEDED,' },
      { types: ['chat.session_title'], statuses: 'SUCCEEDED' },
      { types: 'x'.repeat(129), statuses: 'SUCCEEDED' },
      { types: Array.from({ length: 17 }, (_, index) => `type${index}`).join(','), statuses: 'SUCCEEDED' },
    ]) {
      expect(() => parseJobEventFilters(query)).toThrow();
    }
  });

  it('emits only matching current state, deduplicates it, and cleans up on disconnect', async () => {
    jest.useFakeTimers();
    const { request, response } = createStream();
    let notify: ((jobId: number) => void) | undefined;
    const unsubscribe = jest.fn();
    jest.spyOn(jobNotificationListener, 'subscribeToCategories').mockImplementation((subscriber) => {
      notify = (jobId) => subscriber({ jobId, event: 'succeeded' });
      return unsubscribe;
    });
    const getJobEventsByIdsInWorkspace = jest.fn().mockImplementation(async (jobIds: number[]) => {
      return jobIds.flatMap((jobId) => {
        if (jobId === 1) return [{ id: 1, type: 'chat.session_title', status: JobStatus.SUCCEEDED }];
        if (jobId === 2) return [{ id: 2, type: 'other.type', status: JobStatus.SUCCEEDED }];
        return [];
      });
    });
    const listJobEventsInWorkspace = jest.fn().mockResolvedValue([
      { id: 1, type: 'chat.session_title', status: JobStatus.SUCCEEDED },
    ]);

    streamWorkspaceJobEvents(request, response as never, {
      getJobEventsByIdsInWorkspace,
      listJobEventsInWorkspace,
    } as unknown as JobServiceContract);
    await Promise.resolve();
    await Promise.resolve();
    notify?.(1);
    notify?.(2);
    notify?.(1);
    await jest.advanceTimersByTimeAsync(15000);

    const output = response.write.mock.calls.map(([chunk]) => chunk).join('');
    expect(output).toContain('event: ready\ndata: {}\n\n');
    expect(output.match(/event: job\n/g)).toHaveLength(1);
    expect(output).toContain('data: {"jobId":1,"type":"chat.session_title","status":"SUCCEEDED"}\n\n');
    expect(output).toContain(': keep-alive\n\n');
    expect(output).not.toContain('workspaceId');
    expect(getJobEventsByIdsInWorkspace).toHaveBeenCalledWith([1, 2], 25);
    expect(listJobEventsInWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 25,
      limit: 100,
      completedSince: expect.any(Date),
    }));

    response.emit('close');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    const reads = getJobEventsByIdsInWorkspace.mock.calls.length;
    notify?.(1);
    await jest.advanceTimersByTimeAsync(15000);
    expect(getJobEventsByIdsInWorkspace).toHaveBeenCalledTimes(reads);
  });

  it('continues a large active-job scan across bounded polling passes', async () => {
    jest.useFakeTimers();
    const { request, response } = createStream();
    request.query.statuses = 'QUEUED';
    jest.spyOn(jobNotificationListener, 'subscribeToCategories').mockReturnValue(jest.fn());
    const listJobEventsInWorkspace = jest.fn().mockImplementation(async ({ beforeId }) => {
      const firstId = beforeId === undefined ? 1200 : beforeId - 1;
      return Array.from({ length: 100 }, (_, index) => ({
        id: firstId - index,
        type: 'chat.session_title',
        status: JobStatus.QUEUED,
      }));
    });

    streamWorkspaceJobEvents(request, response as never, {
      getJobEventsByIdsInWorkspace: jest.fn(),
      listJobEventsInWorkspace,
    } as unknown as JobServiceContract);
    await jest.advanceTimersByTimeAsync(0);
    expect(listJobEventsInWorkspace).toHaveBeenCalledTimes(5);
    expect(listJobEventsInWorkspace.mock.calls[4][0].beforeId).toBe(801);

    await jest.advanceTimersByTimeAsync(5000);
    expect(listJobEventsInWorkspace).toHaveBeenCalledTimes(10);
    expect(listJobEventsInWorkspace.mock.calls[5][0].beforeId).toBe(701);
    response.emit('close');
  });

  it('continues completed-job scans with a completion-time and id cursor', async () => {
    jest.useFakeTimers();
    const { request, response } = createStream();
    request.query.statuses = 'SUCCEEDED';
    jest.spyOn(jobNotificationListener, 'subscribeToCategories').mockReturnValue(jest.fn());
    const completedAt = new Date('2026-01-01T00:00:00.000Z');
    const listJobEventsInWorkspace = jest.fn().mockImplementation(async ({ completedBefore }) => {
      const firstId = completedBefore === undefined ? 1200 : completedBefore.id - 1;
      return Array.from({ length: 100 }, (_, index) => ({
        id: firstId - index,
        type: 'chat.session_title',
        status: JobStatus.SUCCEEDED,
        completedAt,
      }));
    });

    streamWorkspaceJobEvents(request, response as never, {
      getJobEventsByIdsInWorkspace: jest.fn(),
      listJobEventsInWorkspace,
    } as unknown as JobServiceContract);
    await jest.advanceTimersByTimeAsync(0);
    expect(listJobEventsInWorkspace).toHaveBeenCalledTimes(5);
    expect(listJobEventsInWorkspace.mock.calls[4][0].completedBefore).toEqual({ completedAt, id: 801 });

    await jest.advanceTimersByTimeAsync(5000);
    expect(listJobEventsInWorkspace.mock.calls[5][0].completedBefore).toEqual({ completedAt, id: 701 });
    expect(response.write.mock.calls.map(([chunk]) => chunk).join('')).not.toContain('completedAt');
    response.emit('close');
  });

  it('bounds notification buffering and workspace queries during a hint burst', async () => {
    jest.useFakeTimers();
    const { request, response } = createStream();
    let notify: ((jobId: number) => void) | undefined;
    jest.spyOn(jobNotificationListener, 'subscribeToCategories').mockImplementation((subscriber) => {
      notify = (jobId) => subscriber({ jobId, event: 'progress' });
      return jest.fn();
    });
    const getJobEventsByIdsInWorkspace = jest.fn().mockResolvedValue([]);
    const listJobEventsInWorkspace = jest.fn().mockResolvedValue([]);
    streamWorkspaceJobEvents(request, response as never, {
      getJobEventsByIdsInWorkspace,
      listJobEventsInWorkspace,
    } as unknown as JobServiceContract);

    for (let jobId = 1; jobId <= 1200; jobId += 1) notify?.(jobId);
    await jest.advanceTimersByTimeAsync(0);
    expect(getJobEventsByIdsInWorkspace).toHaveBeenCalledTimes(10);
    expect(getJobEventsByIdsInWorkspace.mock.calls.every(([ids, workspaceId]) => ids.length <= 100 && workspaceId === 25)).toBe(true);
    expect(getJobEventsByIdsInWorkspace.mock.calls.flatMap(([ids]) => ids)).toHaveLength(1000);
    expect(listJobEventsInWorkspace).toHaveBeenCalled();
    response.emit('close');
  });
});
