import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();
const MAZE_SOLO_GAME_TYPE = 'labirinturi_solo';

// GET /api/stats/me?gameType=integrame&level=1
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const { gameType, level } = req.query;
  const where: Record<string, unknown> = { userId: req.userId };
  if (gameType) where.gameType = gameType;
  if (level) where.level = parseInt(level as string, 10);

  const stats = await prisma.userGameStats.findMany({ where });
  return res.json(stats);
});

// GET /api/stats/solo/maze
router.get('/solo/maze', requireAuth, async (req: AuthRequest, res: Response) => {
  const entries = await prisma.userGameStats.findMany({
    where: { userId: req.userId, gameType: MAZE_SOLO_GAME_TYPE },
    orderBy: { level: 'asc' },
    select: {
      level: true,
      totalMatches: true,
      bestScore: true,
      avgScore: true,
      updatedAt: true,
    },
  });

  return res.json({
    completedLevels: entries.map((entry) => entry.level),
    entries,
  });
});

// POST /api/stats/solo/maze/complete
router.post('/solo/maze/complete', requireAuth, async (req: AuthRequest, res: Response) => {
  const levelRaw = (req.body as { level?: unknown }).level;
  const scoreRaw = (req.body as { score?: unknown }).score;

  const level = typeof levelRaw === 'number' ? Math.floor(levelRaw) : Number(levelRaw);
  const score = typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)
    ? Math.max(0, Math.floor(scoreRaw))
    : 0;

  if (!Number.isFinite(level) || level < 1 || level > 5) {
    return res.status(400).json({ error: 'Nivel invalid' });
  }

  const existing = await prisma.userGameStats.findUnique({
    where: {
      userId_gameType_level: {
        userId: req.userId!,
        gameType: MAZE_SOLO_GAME_TYPE,
        level,
      },
    },
  });

  const bestScore = Math.max(existing?.bestScore ?? 0, score);
  const totalMatches = (existing?.totalMatches ?? 0) + 1;
  const totalScore = (existing?.totalScore ?? 0) + score;

  const updated = await prisma.userGameStats.upsert({
    where: {
      userId_gameType_level: {
        userId: req.userId!,
        gameType: MAZE_SOLO_GAME_TYPE,
        level,
      },
    },
    create: {
      userId: req.userId!,
      gameType: MAZE_SOLO_GAME_TYPE,
      level,
      totalMatches: 1,
      wins: 1,
      losses: 0,
      draws: 0,
      totalScore: score,
      bestScore,
      avgScore: score,
      currentStreak: 0,
      bestStreak: 0,
      eloHistory: '[]',
    },
    update: {
      totalMatches,
      wins: { increment: 1 },
      totalScore,
      bestScore,
      avgScore: totalMatches > 0 ? totalScore / totalMatches : 0,
    },
  });

  return res.json({ ok: true, level, bestScore: updated.bestScore });
});

// GET /api/stats/:userId?gameType=integrame&level=1
router.get('/:userId', async (req: Request, res: Response) => {
  const { gameType, level } = req.query;
  const where: Record<string, unknown> = { userId: req.params.userId };
  if (gameType) where.gameType = gameType;
  if (level) where.level = parseInt(level as string, 10);

  const stats = await prisma.userGameStats.findMany({ where });
  return res.json(stats);
});

export default router;
