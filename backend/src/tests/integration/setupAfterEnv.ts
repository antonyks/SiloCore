import { integrationPrisma } from './helpers/prisma';

afterAll(async () => {
  await integrationPrisma.$disconnect();
});
