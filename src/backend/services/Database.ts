import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export const db = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

export async function initDatabase() {
  try {
    await db.$connect();
    logger.info('Connected to SQLite database via Prisma');
  } catch (error) {
    logger.error('Failed to connect to the database', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await db.$disconnect();
});
