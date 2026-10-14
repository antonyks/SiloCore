import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { safeErrorDiagnostic } from './safeErrorDiagnostic';

const prisma = new PrismaClient();

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error({ ...safeErrorDiagnostic(error), operation: 'database.connect' }, 'Database connection failed.');
    process.exit(1);
  }
}

export { prisma };
