import type { Prisma } from '@prisma/client';

export type JobQueuePayload = {
  jobId: number;
};

export type JobQueueSendOptions = Record<string, unknown>;

export interface JobQueueTransport {
  send(
    queueName: string,
    data: JobQueuePayload,
    options?: JobQueueSendOptions,
  ): Promise<string | null>;
}

export interface EnqueueJobInput {
  workspaceId: number;
  createdByUserId: number;
  type: string;
  payload?: Prisma.InputJsonValue;
  maxAttempts?: number;
  stage?: string;
  queueName?: string;
}

export interface JobReconciliationResult {
  skipped: boolean;
  scanned: number;
  reenqueued: number;
  failed: number;
}
