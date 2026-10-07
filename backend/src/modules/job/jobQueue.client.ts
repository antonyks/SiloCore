import type { PgBoss as PgBossType } from 'pg-boss';
import { ENV } from '../../config/env';
import { PgBossJobQueueTransport } from './jobQueue.transport';
import { JobQueueTransport } from './job.types';
import { importPgBoss } from './pgBoss.loader.cjs';

export type ApiQueueClient = Pick<PgBossType, 'start' | 'stop' | 'send' | 'createQueue'>;

export function createJobQueueClient(
  config = {
    connectionString: ENV.DATABASE_URL,
    schema: ENV.PGBOSS_SCHEMA,
    migrate: true,
    createSchema: true,
    supervise: false,
    schedule: false,
  },
  createClient: (config: ConstructorParameters<typeof PgBossType>[0]) => Promise<ApiQueueClient> = async (options) => {
    const { PgBoss } = await importPgBoss();
    return new PgBoss(options);
  },
) {
  let boss: ApiQueueClient | undefined;
  let transport: JobQueueTransport | undefined;
  let startPromise: Promise<JobQueueTransport> | undefined;
  let stopPromise: Promise<void> | undefined;

  async function startJobQueueClient(): Promise<JobQueueTransport> {
    if (stopPromise) await stopPromise;
    if (transport) return transport;
    if (startPromise) return startPromise;

    startPromise = startClient();

    try {
      return await startPromise;
    } finally {
      startPromise = undefined;
    }
  }

  function getJobQueueTransport(): JobQueueTransport {
    if (!transport) {
      throw new Error('Job queue client has not been started.');
    }

    return transport;
  }

  function stopJobQueueClient(): Promise<void> {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      await startPromise?.catch(() => undefined);
      await disposeClient();
    })().finally(() => { stopPromise = undefined; });
    return stopPromise;
  }

  async function disposeClient(): Promise<void> {
    const client = boss;
    boss = undefined;
    transport = undefined;

    if (!client) return;

    await client.stop({ graceful: true, close: true });
  }

  async function startClient(): Promise<JobQueueTransport> {
    const client = await createClient(config);
    boss = client;
    try {
      await client.start();
    } catch (error) {
      await disposeClient().catch(() => undefined);
      throw error;
    }
    transport = new PgBossJobQueueTransport(client);

    return transport;
  }

  return { start: startJobQueueClient, getTransport: getJobQueueTransport, stop: stopJobQueueClient };
}

const defaultClient = createJobQueueClient();
export const startJobQueueClient = defaultClient.start;
export const getJobQueueTransport = defaultClient.getTransport;
export const stopJobQueueClient = defaultClient.stop;
