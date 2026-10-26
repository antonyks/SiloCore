import { Client, Notification } from 'pg';
import { prisma } from '../../config/database';
import { ENV } from '../../config/env';
import { logger } from '../../config/logger';
import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';

export const JOB_NOTIFICATION_CHANNEL = 'silocore_job_state_changed';

export type JobNotificationHint =
  | 'queued'
  | 'enqueue_failed'
  | 'running'
  | 'progress'
  | 'cancellation_requested'
  | 'cancelled'
  | 'succeeded'
  | 'failed'
  | 'heartbeat';

export interface JobNotification {
  jobId: number;
  event: JobNotificationHint;
}

type JobNotificationSubscriber = (notification: JobNotification) => void;

type PgNotificationClient = Pick<Client, 'connect' | 'end' | 'on' | 'query'>;

const VALID_JOB_NOTIFICATION_HINTS = new Set<JobNotificationHint>([
  'queued',
  'enqueue_failed',
  'running',
  'progress',
  'cancellation_requested',
  'cancelled',
  'succeeded',
  'failed',
  'heartbeat',
]);

export async function notifyJobChanged(
  jobId: number,
  event: JobNotificationHint,
): Promise<void> {
  const payload = JSON.stringify({ jobId, event });
  await prisma.$executeRaw`
    SELECT pg_notify(${JOB_NOTIFICATION_CHANNEL}, ${payload})
  `;
}

export async function bestEffortNotifyJobChanged(
  jobId: number,
  event: JobNotificationHint,
): Promise<void> {
  try {
    await notifyJobChanged(jobId, event);
  } catch (error) {
    logger.warn(
      { jobId, event, operation: 'job.notify', ...safeErrorDiagnostic(error) },
      'Job notification failed.',
    );
  }
}

export function parseJobNotificationPayload(payload: string | undefined): JobNotification | null {
  if (!payload) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('jobId' in parsed) ||
    !('event' in parsed)
  ) {
    return null;
  }

  const { jobId, event } = parsed;
  if (
    typeof jobId !== 'number' ||
    !Number.isSafeInteger(jobId) ||
    jobId <= 0 ||
    typeof event !== 'string' ||
    !VALID_JOB_NOTIFICATION_HINTS.has(event as JobNotificationHint)
  ) {
    return null;
  }

  return { jobId, event: event as JobNotificationHint };
}

export class JobNotificationListener {
  private client: PgNotificationClient | null = null;
  private startPromise: Promise<void> | null = null;
  private suppressClientErrors = false;
  private readonly subscribersByJobId = new Map<number, Set<JobNotificationSubscriber>>();
  private readonly categorySubscribers = new Set<JobNotificationSubscriber>();

  constructor(
    private readonly createClient: () => PgNotificationClient = () =>
      new Client({ connectionString: ENV.DATABASE_URL }),
  ) {}

  subscribe(jobId: number, subscriber: JobNotificationSubscriber): () => void {
    const subscribers = this.subscribersByJobId.get(jobId) ?? new Set();
    subscribers.add(subscriber);
    this.subscribersByJobId.set(jobId, subscribers);

    void this.start().catch((error) => {
      logger.warn(
        { jobId, operation: 'job.listen', ...safeErrorDiagnostic(error) },
        'Job notification listener failed to start; polling fallback remains active.',
      );
    });

    return () => {
      const currentSubscribers = this.subscribersByJobId.get(jobId);
      if (!currentSubscribers) return;

      currentSubscribers.delete(subscriber);
      if (currentSubscribers.size === 0) {
        this.subscribersByJobId.delete(jobId);
      }
    };
  }

  subscribeToCategories(subscriber: JobNotificationSubscriber): () => void {
    this.categorySubscribers.add(subscriber);

    void this.start().catch((error) => {
      logger.warn(
        { operation: 'job.listen', ...safeErrorDiagnostic(error) },
        'Job notification listener failed to start; polling fallback remains active.',
      );
    });

    return () => {
      this.categorySubscribers.delete(subscriber);
    };
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.startPromise = null;
    this.suppressClientErrors = true;
    this.subscribersByJobId.clear();
    this.categorySubscribers.clear();

    if (client) {
      await client.end();
    }
  }

  handleNotification(notification: Pick<Notification, 'channel' | 'payload'>): void {
    if (notification.channel !== JOB_NOTIFICATION_CHANNEL) return;

    const parsedNotification = parseJobNotificationPayload(notification.payload ?? undefined);
    if (!parsedNotification) return;

    for (const subscriber of this.subscribersByJobId.get(parsedNotification.jobId) ?? []) {
      subscriber(parsedNotification);
    }
    for (const subscriber of this.categorySubscribers) {
      subscriber(parsedNotification);
    }
  }

  private async start(): Promise<void> {
    if (this.client) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startClient().catch((error: unknown) => {
      this.startPromise = null;
      throw error;
    });
    return this.startPromise;
  }

  private async startClient(): Promise<void> {
    const client = this.createClient();
    this.suppressClientErrors = false;
    client.on('notification', (notification) => {
      this.handleNotification(notification);
    });
    client.on('error', (error) => {
      if (this.suppressClientErrors) return;
      logger.warn(
        { operation: 'job.listen', ...safeErrorDiagnostic(error) },
        'Job notification listener error; polling fallback remains active.',
      );
    });

    await client.connect();
    await client.query(`LISTEN ${JOB_NOTIFICATION_CHANNEL}`);
    this.client = client;
  }
}

export const jobNotificationListener = new JobNotificationListener();
