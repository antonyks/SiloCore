import { ChatSessionTitleSource, JobStatus, WorkspaceStatus } from '@prisma/client';
import { Client } from 'pg';
import { ENV } from '../../config/env';
import { prisma } from '../../config/database';
import { SESSION_TITLE_JOB_TYPE } from '../worker/sessionTitleJob';

const SESSION_TITLE_LOCK_NAMESPACE = 753009;
const ACTIVE_JOB_STATUSES = [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.CANCEL_REQUESTED];

export interface SessionTitleClaim {
  sessionId: number;
  workspaceId: number;
  createdByUserId: number;
  assistantMessageId: number;
}

export const SessionTitleSchedulerRepository = {
  findCandidates(limit: number): Promise<Array<{ id: number }>> {
    return prisma.$queryRaw<Array<{ id: number }>>`
      SELECT session.id
      FROM chat_sessions AS session
      JOIN workspaces AS workspace ON workspace.id = session."workspaceId"
      WHERE session."titleSource" = 'PLACEHOLDER'::"ChatSessionTitleSource"
        AND session."latestEligibleAssistantMessageId" IS NOT NULL
        AND (session."latestAttemptedAssistantMessageId" IS NULL
          OR session."latestEligibleAssistantMessageId" > session."latestAttemptedAssistantMessageId")
        AND workspace.status = 'ACTIVE'::"WorkspaceStatus"
        AND NOT EXISTS (
          SELECT 1 FROM jobs AS job
          WHERE job."workspaceId" = session."workspaceId"
            AND job.type = ${SESSION_TITLE_JOB_TYPE}
            AND job.payload ->> 'sessionId' = session.id::text
            AND job.status IN ('QUEUED'::"JobStatus", 'RUNNING'::"JobStatus", 'CANCEL_REQUESTED'::"JobStatus")
        )
      ORDER BY session.id
      LIMIT ${limit}
    `;
  },

  async withSessionLock<T>(sessionId: number, callback: () => Promise<T>): Promise<T | null> {
    const client = new Client({ connectionString: ENV.DATABASE_URL });
    let acquired = false;
    try {
      await client.connect();
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired',
        [SESSION_TITLE_LOCK_NAMESPACE, sessionId],
      );
      acquired = result.rows[0]?.acquired === true;
      if (!acquired) return null;
      return await callback();
    } finally {
      try {
        if (acquired) {
          await client.query('SELECT pg_advisory_unlock($1::integer, $2::integer)',
            [SESSION_TITLE_LOCK_NAMESPACE, sessionId]);
        }
      } finally {
        await client.end();
      }
    }
  },

  claimLatest(sessionId: number): Promise<SessionTitleClaim | null> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.chatSession.findFirst({
        where: {
          id: sessionId,
          titleSource: ChatSessionTitleSource.PLACEHOLDER,
          workspace: { status: WorkspaceStatus.ACTIVE },
        },
        select: {
          id: true,
          workspaceId: true,
          userId: true,
          latestEligibleAssistantMessageId: true,
          latestAttemptedAssistantMessageId: true,
        },
      });
      const assistantMessageId = session?.latestEligibleAssistantMessageId;
      if (!session || assistantMessageId === null || assistantMessageId === undefined
        || (session.latestAttemptedAssistantMessageId !== null
          && assistantMessageId <= session.latestAttemptedAssistantMessageId)) return null;

      const activeJob = await tx.job.findFirst({
        where: {
          workspaceId: session.workspaceId,
          type: SESSION_TITLE_JOB_TYPE,
          status: { in: ACTIVE_JOB_STATUSES },
          payload: { path: ['sessionId'], equals: sessionId },
        },
        select: { id: true },
      });
      if (activeJob) return null;

      const updated = await tx.chatSession.updateMany({
        where: {
          id: sessionId,
          workspaceId: session.workspaceId,
          titleSource: ChatSessionTitleSource.PLACEHOLDER,
          latestEligibleAssistantMessageId: assistantMessageId,
          OR: [
            { latestAttemptedAssistantMessageId: null },
            { latestAttemptedAssistantMessageId: { lt: assistantMessageId } },
          ],
        },
        data: { latestAttemptedAssistantMessageId: assistantMessageId },
      });
      if (updated.count !== 1) return null;

      return {
        sessionId: session.id,
        workspaceId: session.workspaceId,
        createdByUserId: session.userId,
        assistantMessageId,
      };
    });
  },
};
