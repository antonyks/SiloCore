import { PrismaClient, type Prisma, UserRole, UserStatus } from '@prisma/client';

export const integrationPrisma = new PrismaClient();

const tablesToReset = ['chat_messages', 'chat_sessions', 'llm_provider_configs', 'users'];

export async function resetIntegrationDatabase(): Promise<void> {
  await integrationPrisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tablesToReset.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export async function createIntegrationTestUser(
  overrides: Partial<Prisma.UserCreateInput> = {},
) {
  const uniqueValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return integrationPrisma.user.create({
    data: {
      email: `integration-${uniqueValue}@example.com`,
      name: 'Integration Test User',
      passwordHash: 'integration-test-password-hash',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      ...overrides,
    },
  });
}
