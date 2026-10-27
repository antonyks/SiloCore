import { ChatSessionTitleSource, JobStatus, MessageAuthor, WorkspaceStatus } from '@prisma/client';
import { JobService } from '../../../modules/job/job.service';
import { JobQueueTransport } from '../../../modules/job/job.types';
import { SessionTitleSchedulerRepository } from '../../../modules/chat/sessionTitleScheduler.repository';
import { createSessionTitleScheduling } from '../../../modules/worker/sessionTitleScheduler';
import { SESSION_TITLE_JOB_TYPE } from '../../../modules/worker/sessionTitleJob';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import {
  createIntegrationChatMessage,
  createIntegrationChatSession,
  createIntegrationTestUser,
  integrationPrisma,
  resetIntegrationDatabase,
} from '../helpers/prisma';

beforeEach(resetIntegrationDatabase);

async function eligibleSession() {
  const owner = await createIntegrationTestUser();
  const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(owner.id);
  const session = await createIntegrationChatSession(owner.id, {
    workspace: { connect: { id: workspace.id } },
    title: 'New Chat', titleSource: ChatSessionTitleSource.PLACEHOLDER,
  });
  const assistantMessageId = await addEligibleReply(session.id);
  return { owner, workspace, session, assistantMessageId };
}

async function addEligibleReply(sessionId: number) {
  const user = await createIntegrationChatMessage(sessionId, { content: 'A question' });
  const assistant = await integrationPrisma.chatMessage.create({
    data: { sessionId, author: MessageAuthor.ASSISTANT, content: 'A complete reply',
      triggeringUserMessageId: user.id, metadata: { finishReason: 'stop' } },
  });
  await integrationPrisma.chatSession.update({
    where: { id: sessionId }, data: { latestEligibleAssistantMessageId: assistant.id },
  });
  return assistant.id;
}

function fakeTransport() {
  let count = 0;
  const send = jest.fn(async () => `title-message-${++count}`);
  return { send } as JobQueueTransport & { send: typeof send };
}

describe('session title scheduler PostgreSQL integration', () => {
  it('scans bounded batches and creates minimal one-attempt jobs', async () => {
    const sessions = await Promise.all([eligibleSession(), eligibleSession(), eligibleSession()]);
    const transport = fakeTransport();
    const scheduling = createSessionTitleScheduling();

    expect(await scheduling.enqueueEligibleSessionTitles(transport, 2)).toBe(2);
    expect(await integrationPrisma.job.count({ where: { type: SESSION_TITLE_JOB_TYPE } })).toBe(2);
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 2)).toBe(1);
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 2)).toBe(0);
    expect(transport.send).toHaveBeenCalledTimes(3);
    const jobs = await integrationPrisma.job.findMany({ orderBy: { id: 'asc' } });
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      const session = sessions.find((entry) => entry.session.id === (job.payload as { sessionId: number }).sessionId);
      expect(session).toBeDefined();
      expect(job).toMatchObject({
        workspaceId: session!.workspace.id, createdByUserId: session!.owner.id,
        type: SESSION_TITLE_JOB_TYPE, status: JobStatus.QUEUED, maxAttempts: 1,
        payload: { sessionId: session!.session.id, assistantMessageId: session!.assistantMessageId },
      });
      expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session!.session.id } }))
        .latestAttemptedAssistantMessageId).toBe(session!.assistantMessageId);
    }
    expect(transport.send).toHaveBeenCalledWith(SESSION_TITLE_JOB_TYPE,
      expect.objectContaining({ jobId: expect.any(Number) }), { retryLimit: 0 });
    expect(JSON.stringify(transport.send.mock.calls)).not.toContain('A question');
  });

  it('holds the session lock across enqueue and schedules a newer turn after insufficient context', async () => {
    const data = await eligibleSession();
    let releaseSend!: () => void;
    let sendStarted!: () => void;
    const sendGate = new Promise<void>((resolve) => { releaseSend = resolve; });
    const entered = new Promise<void>((resolve) => { sendStarted = resolve; });
    const transport: JobQueueTransport = {
      send: jest.fn(async () => {
        sendStarted();
        await sendGate;
        return 'held-message';
      }),
    };
    const scheduling = createSessionTitleScheduling();
    const firstTick = scheduling.enqueueEligibleSessionTitles(transport, 50);
    await entered;
    const newerId = await addEligibleReply(data.session.id);

    expect(await SessionTitleSchedulerRepository.withSessionLock(data.session.id, async () => true)).toBeNull();
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(0);
    releaseSend();
    expect(await firstTick).toBe(1);
    const firstJob = await integrationPrisma.job.findFirstOrThrow();
    expect(firstJob.payload).toEqual({ sessionId: data.session.id, assistantMessageId: data.assistantMessageId });
    await integrationPrisma.job.update({
      where: { id: firstJob.id }, data: { status: JobStatus.SUCCEEDED, result: { outcome: 'NOT_ENOUGH_CONTEXT' } },
    });

    expect(await scheduling.enqueueEligibleSessionTitles(fakeTransport(), 50)).toBe(1);
    const jobs = await integrationPrisma.job.findMany({ orderBy: { id: 'asc' } });
    expect(jobs[1].payload).toEqual({ sessionId: data.session.id, assistantMessageId: newerId });
    expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: data.session.id } }))
      .latestAttemptedAssistantMessageId).toBe(newerId);
  });

  it('consumes an enqueue failure and waits for a newer reply', async () => {
    const data = await eligibleSession();
    const send = jest.fn().mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce('recovered-message');
    const transport = { send } as JobQueueTransport;
    const scheduling = createSessionTitleScheduling();

    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(0);
    expect((await integrationPrisma.job.findFirstOrThrow()).status).toBe(JobStatus.FAILED);
    expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: data.session.id } }))
      .latestAttemptedAssistantMessageId).toBe(data.assistantMessageId);
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(0);
    const newerId = await addEligibleReply(data.session.id);
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(1);
    expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: data.session.id } }))
      .latestAttemptedAssistantMessageId).toBe(newerId);
  });

  it('skips manual titles, inactive workspaces, and newer replies while a job remains active', async () => {
    const renamed = await eligibleSession();
    const inactive = await eligibleSession();
    const active = await eligibleSession();
    await integrationPrisma.chatSession.update({
      where: { id: renamed.session.id }, data: { title: 'My title', titleSource: ChatSessionTitleSource.USER },
    });
    await integrationPrisma.workspace.update({
      where: { id: inactive.workspace.id }, data: { status: WorkspaceStatus.DELETED },
    });
    const scheduling = createSessionTitleScheduling();
    const transport = fakeTransport();

    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(1);
    const newerId = await addEligibleReply(active.session.id);
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(0);
    expect(await SessionTitleSchedulerRepository.claimLatest(active.session.id)).toBeNull();
    expect((await integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: active.session.id } }))
      .latestAttemptedAssistantMessageId).toBe(active.assistantMessageId);
    expect(newerId).toBeGreaterThan(active.assistantMessageId);
    expect(await integrationPrisma.job.count()).toBe(1);
  });

  it('keeps startup recovery for queued jobs and does not retry an exhausted running job', async () => {
    const data = await eligibleSession();
    const scheduling = createSessionTitleScheduling();
    const transport = fakeTransport();
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(1);
    const job = await integrationPrisma.job.findFirstOrThrow();
    await integrationPrisma.job.update({ where: { id: job.id }, data: { queueMessageId: null } });

    expect(await JobService.reconcileQueuedJobsWithoutQueueMessage(transport)).toMatchObject({
      scanned: 1, reenqueued: 1,
    });
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(0);
    const staleAt = new Date(Date.now() - 10_000);
    await integrationPrisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.RUNNING, attempts: 1, startedAt: staleAt, heartbeatAt: staleAt },
    });
    expect(await JobService.recoverStaleRunningJobs(transport, { staleJobMs: 1_000 })).toMatchObject({
      scanned: 1, failed: 1,
    });
    expect((await integrationPrisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(JobStatus.FAILED);
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(0);
    await addEligibleReply(data.session.id);
    expect(await scheduling.enqueueEligibleSessionTitles(transport, 50)).toBe(1);
  });
});
