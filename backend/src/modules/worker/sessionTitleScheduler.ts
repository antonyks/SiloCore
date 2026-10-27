import { JobStatus } from '@prisma/client';
import type { JobServiceContract } from '../job/job.service';
import { logger } from '../../config/logger';
import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';
import { SessionTitleSchedulerRepository } from '../chat/sessionTitleScheduler.repository';
import { JobQueueTransport, JobService } from '../job';
import { SESSION_TITLE_JOB_QUEUE, SESSION_TITLE_JOB_TYPE } from './sessionTitleJob';

export interface SessionTitleSchedulerDependencies {
  repository: typeof SessionTitleSchedulerRepository;
  jobService: JobServiceContract;
}

export function createSessionTitleScheduling(dependencies: Partial<SessionTitleSchedulerDependencies> = {}) {
  const repository = dependencies.repository ?? SessionTitleSchedulerRepository;
  const jobService = dependencies.jobService ?? JobService;

  async function enqueueEligibleSessionTitles(
    queueTransport: JobQueueTransport,
    batchSize: number,
    shouldStop: () => boolean = () => false,
  ): Promise<number> {
    const candidates = await repository.findCandidates(batchSize);
    let enqueued = 0;
    for (const candidate of candidates) {
      if (shouldStop()) break;
      await repository.withSessionLock(candidate.id, async () => {
        const claim = await repository.claimLatest(candidate.id);
        if (!claim) return;

        const job = await jobService.enqueueJob({
          workspaceId: claim.workspaceId,
          createdByUserId: claim.createdByUserId,
          type: SESSION_TITLE_JOB_TYPE,
          queueName: SESSION_TITLE_JOB_QUEUE,
          payload: { sessionId: claim.sessionId, assistantMessageId: claim.assistantMessageId },
          maxAttempts: 1,
          stage: 'session_title_queued',
        }, queueTransport);
        if (job.status === JobStatus.QUEUED) enqueued += 1;
      });
    }
    return enqueued;
  }

  function startSessionTitleScheduler(params: {
    intervalMs: number;
    batchSize: number;
    queueTransport: JobQueueTransport;
  }) {
    let stopped = false;
    let inFlight: Promise<void> | undefined;

    const runTick = (): void => {
      if (stopped || inFlight) return;
      inFlight = (async () => {
        try {
          const enqueued = await enqueueEligibleSessionTitles(params.queueTransport, params.batchSize, () => stopped);
          if (enqueued > 0) {
            logger.info({ operation: 'chat.sessionTitle.schedule', enqueued },
              'Session title scheduling tick completed.');
          }
        } catch (error) {
          logger.error({ operation: 'chat.sessionTitle.schedule', ...safeErrorDiagnostic(error) },
            'Session title scheduling tick failed.');
        }
      })().finally(() => { inFlight = undefined; });
    };

    runTick();
    const interval = setInterval(runTick, params.intervalMs);
    return {
      stop: async () => {
        stopped = true;
        clearInterval(interval);
        await inFlight;
      },
    };
  }

  return { enqueueEligibleSessionTitles, startSessionTitleScheduler };
}
