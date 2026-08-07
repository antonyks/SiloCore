import { integrationPrisma } from './helpers/prisma';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'integration-test-uuid'),
}));

jest.mock('node-fetch', () => jest.fn((url: string | URL, init?: RequestInit) => fetch(url, init)));

afterAll(async () => {
  await integrationPrisma.$disconnect();
});
