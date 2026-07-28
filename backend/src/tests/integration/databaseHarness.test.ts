import {
  createIntegrationTestUser,
  integrationPrisma,
  resetIntegrationDatabase,
} from './helpers/prisma';

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('PostgreSQL integration test harness', () => {
  it('connects to the migrated database', async () => {
    const result = await integrationPrisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;

    expect(result).toEqual([{ ok: 1 }]);
  });

  it('creates users through the real Prisma client', async () => {
    const user = await createIntegrationTestUser({ email: 'integration-user@example.com' });

    expect(user.id).toBe(1);
    expect(user.email).toBe('integration-user@example.com');
    await expect(integrationPrisma.user.count()).resolves.toBe(1);
  });

  it('resets persisted state and identity values between tests', async () => {
    await createIntegrationTestUser({ email: 'first-reset-user@example.com' });
    await resetIntegrationDatabase();

    const user = await createIntegrationTestUser({ email: 'second-reset-user@example.com' });

    expect(user.id).toBe(1);
    await expect(integrationPrisma.user.count()).resolves.toBe(1);
  });
});
