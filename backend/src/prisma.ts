import { PrismaClient } from '@prisma/client';
import logger from './logger';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env['NODE_ENV'] !== 'production') globalForPrisma.prisma = prisma;

// Route Prisma events through Winston so they appear in logs + files
// @ts-ignore
prisma.$on('query', (e: { query: string; params: string; duration: number }) => {
  logger.debug(`[DB] ${e.query}  (${e.duration}ms)`, { params: e.params });
});
// @ts-ignore
prisma.$on('error', (e: { message: string }) => {
  logger.error(`[DB] ${e.message}`);
});
// @ts-ignore
prisma.$on('warn', (e: { message: string }) => {
  logger.warn(`[DB] ${e.message}`);
});

export default prisma;
