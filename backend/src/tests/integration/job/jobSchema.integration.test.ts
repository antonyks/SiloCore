import { JobStatus, Prisma, WorkspaceType } from '@prisma/client';
import { assertJobDataIsSanitized } from '../../../modules/job';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('Job schema integration', () => {
  it('creates a workspace-scoped job with default lifecycle state', async () => {
    const owner = await createIntegrationTestUser({ email: 'job-owner@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Job Workspace',
        type: WorkspaceType.STANDARD,
        ownerUserId: owner.id,
      },
    });

    const payload = {
      workspaceId: workspace.id,
      providerId: 7,
      operationId: 'health-sample-1',
    };
    assertJobDataIsSanitized(payload);

    const job = await integrationPrisma.job.create({
      data: {
        workspaceId: workspace.id,
        createdByUserId: owner.id,
        type: 'provider.health.sample',
        payload,
      },
    });

    expect(job).toMatchObject({
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      type: 'provider.health.sample',
      status: JobStatus.QUEUED,
      progress: 0,
      stage: 'queued',
      payload,
      result: null,
      attempts: 0,
      maxAttempts: 1,
      queueMessageId: null,
      startedAt: null,
      completedAt: null,
      heartbeatAt: null,
      cancelRequestedAt: null,
    });
  });

  it('rejects jobs without an existing workspace or creator', async () => {
    await expect(
      integrationPrisma.job.create({
        data: {
          workspaceId: 999,
          createdByUserId: 999,
          type: 'missing.links',
        },
      }),
    ).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({
      code: 'P2003',
    });
  });

  it('supports workspace and status queries needed by job APIs', async () => {
    const owner = await createIntegrationTestUser({ email: 'job-query-owner@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Job Query Workspace',
        type: WorkspaceType.STANDARD,
        ownerUserId: owner.id,
      },
    });
    const otherWorkspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Other Job Query Workspace',
        type: WorkspaceType.STANDARD,
        ownerUserId: owner.id,
      },
    });

    await integrationPrisma.job.createMany({
      data: [
        {
          workspaceId: workspace.id,
          createdByUserId: owner.id,
          type: 'validation.fixture',
          status: JobStatus.QUEUED,
        },
        {
          workspaceId: workspace.id,
          createdByUserId: owner.id,
          type: 'validation.fixture',
          status: JobStatus.RUNNING,
          stage: 'running',
          progress: 10,
        },
        {
          workspaceId: otherWorkspace.id,
          createdByUserId: owner.id,
          type: 'validation.fixture',
          status: JobStatus.QUEUED,
        },
      ],
    });

    await expect(
      integrationPrisma.job.findMany({
        where: {
          workspaceId: workspace.id,
          status: JobStatus.QUEUED,
        },
      }),
    ).resolves.toHaveLength(1);
  });

  it('stores sanitized operational result data without prompt or secret content', async () => {
    const owner = await createIntegrationTestUser({ email: 'job-result-owner@example.com' });
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Job Result Workspace',
        type: WorkspaceType.STANDARD,
        ownerUserId: owner.id,
      },
    });

    const result = {
      checksum: 'abc123',
      processedCount: 5,
      providerId: 3,
    };
    assertJobDataIsSanitized(result, 'job result');

    const job = await integrationPrisma.job.create({
      data: {
        workspaceId: workspace.id,
        createdByUserId: owner.id,
        type: 'validation.fixture',
        status: JobStatus.SUCCEEDED,
        progress: 100,
        stage: 'completed',
        result,
        completedAt: new Date(),
      },
    });

    expect(job.result).toEqual(result);
    expect(JSON.stringify(job.payload)).not.toContain('apiKey');
    expect(JSON.stringify(job.result)).not.toContain('secret');
  });
});
