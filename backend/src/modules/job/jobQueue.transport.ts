import type { PgBoss, SendOptions } from 'pg-boss';
import { JobQueuePayload, JobQueueSendOptions, JobQueueTransport } from './job.types';

export class PgBossJobQueueTransport implements JobQueueTransport {
  constructor(private readonly boss: PgBoss) {}

  send(
    queueName: string,
    data: JobQueuePayload,
    options?: JobQueueSendOptions,
  ): Promise<string | null> {
    return this.boss.send(queueName, data, options as SendOptions | undefined);
  }
}
