import { integrationPrisma } from './helpers/prisma';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'integration-test-uuid'),
}));

jest.mock('node-fetch', () => jest.fn());

afterAll(async () => {
  await integrationPrisma.$disconnect();
});
