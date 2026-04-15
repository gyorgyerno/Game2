import 'dotenv/config';
import path from 'path';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import logger from './logger';
import { requestLogger } from './middleware/requestLogger';
import { globalErrorHandler } from './middleware/errorHandler';
import { initSocket, io } from './socket';
import authRoutes from './routes/auth';
import matchRoutes from './routes/matches';
import leaderboardRoutes from './routes/leaderboard';
import inviteRoutes from './routes/invites';
import statsRoutes from './routes/stats';
import userRoutes from './routes/users';
import logsRoutes from './routes/logs';
import adminRoutes from './routes/admin';
import aiRoutes from './routes/ai';
import friendRoutes from './routes/friends';
import gamesRoutes from './routes/games';
import contestsRoutes from './routes/contests';
import premiumRoomsRoutes from './routes/premiumRooms';
import prisma from './prisma';
import { activityFeedGenerator } from './services/simulatedPlayers/ActivityFeedGenerator';
import { botChatGenerator } from './services/simulatedPlayers/BotChatGenerator';
import { runtimeMetricsMonitor } from './services/simulatedPlayers/RuntimeMetricsMonitor';
import { gameRegistry } from './games/GameRegistry';
import { systemConfigService } from './services/SystemConfigService';
import { gameLevelConfigService } from './services/GameLevelConfigService';
import { contestEngine } from './services/ContestEngine';

const app = express();
const server = http.createServer(app);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json());
// Servire imagini de profil uploadate
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(requestLogger);   // ← HTTP request/response logging
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/admin/simulated-players/health',
  })
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/contests', contestsRoutes);
app.use('/api/premium-rooms', premiumRoomsRoutes);

app.get('/health', (_req: import('express').Request, res: import('express').Response) =>
  res.json({ status: 'ok', ts: new Date() })
);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req: import('express').Request, res: import('express').Response) =>
  res.status(404).json({ error: 'Route not found' })
);

// ─── Global error handler (MUST be last) ──────────────────────────────────────
app.use(globalErrorHandler);

// ─── Socket ───────────────────────────────────────────────────────────────────
initSocket(server);

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(config.port, async () => {
  logger.info(`🚀 Backend pornit pe http://localhost:${config.port}`, {
    env: process.env['NODE_ENV'] ?? 'development',
    port: config.port,
  });

  // Verify DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Conexiune DB reușită (SQLite)');
  } catch (err) {
    logger.error('❌ Conexiune DB eșuată', { err });
  }

  // Seed date de baza (game_types)
  try {
    const gameTypes = [
      { id: 'integrame', name: 'Integrame', description: 'Rezolva integrame cu alti jucatori' },
      { id: 'maze', name: 'Labirinturi', description: 'Navigheaza labirintul in multiplayer' },
      { id: 'slogane', name: 'Slogane', description: 'Joc cu slogane' },
    ];
    for (const gt of gameTypes) {
      await prisma.gameType.upsert({
        where: { id: gt.id },
        update: {},
        create: { ...gt, isActive: true },
      });
    }
    logger.info('✅ Game types seeded');
  } catch (err) {
    logger.error('❌ Seed game types esuat', { err });
  }

  activityFeedGenerator.start();
  botChatGenerator.start();
  runtimeMetricsMonitor.start();

  // Încarcă override-urile de scoring din DB
  try {
    await gameRegistry.loadScoringOverrides(prisma);
    logger.info('✅ Scoring overrides încărcate din DB');
  } catch (err) {
    logger.error('❌ Scoring overrides load eșuat', { err });
  }

  // Încarcă configurația sistem (ELO / XP / Ligi) din DB
  try {
    await systemConfigService.load(prisma);
    logger.info('✅ System config (ELO/XP/Ligi) încărcat din DB');
  } catch (err) {
    logger.error('❌ System config load eșuat', { err });
  }

  // Încarcă configurația nivelelor din DB (seed automat dacă e gol)
  try {
    await gameLevelConfigService.load(prisma);
    logger.info('✅ Game level configs încărcate din DB');
  } catch (err) {
    logger.error('❌ Game level configs load eșuat', { err });
  }

  // Pornește ContestEngine (tranziții automate de status + real-time)
  try {
    contestEngine.start(prisma, io);
    logger.info('✅ ContestEngine pornit');
  } catch (err) {
    logger.error('❌ ContestEngine start eșuat', { err });
  }

  // Cleanup matches blocate în 'waiting' de mai mult de 15 minute (ex: browser închis în lobby)
  const cleanupStaleWaitingMatches = async () => {
    try {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000);
      const result = await prisma.match.updateMany({
        where: { status: 'waiting', createdAt: { lt: cutoff } },
        data: { status: 'abandoned', finishedAt: new Date() },
      });
      if (result.count > 0) {
        logger.info(`🧹 Cleanup: ${result.count} match(uri) 'waiting' stale marcate 'abandoned'`);
      }
    } catch (err) {
      logger.error('❌ Cleanup stale waiting matches eșuat', { err });
    }
  };
  // Rulează la startup și apoi la fiecare 10 minute
  cleanupStaleWaitingMatches();
  setInterval(cleanupStaleWaitingMatches, 10 * 60 * 1000);
});

export default app;
