import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { systemConfigService } from '../services/SystemConfigService';

const router = Router();
const INTEGRAME_SOLO_GAME_TYPE = 'integrame_solo';
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

// GET /api/stats/solo/integrame
router.get('/solo/integrame', requireAuth, async (req: AuthRequest, res: Response) => {
  const entries = await prisma.userSoloGameProgress.findMany({
    where: { userId: req.userId, gameType: INTEGRAME_SOLO_GAME_TYPE },
    orderBy: [{ level: 'asc' }, { gameIndex: 'asc' }],
    select: {
      level: true,
      gameIndex: true,
      completedAt: true,
    },
  });

  return res.json({
    completedGames: entries.map((entry) => ({
      level: entry.level,
      gameIndex: entry.gameIndex,
      completedAt: entry.completedAt,
    })),
  });
});

// POST /api/stats/solo/integrame/complete
router.post('/solo/integrame/complete', requireAuth, async (req: AuthRequest, res: Response) => {
  const levelRaw = (req.body as { level?: unknown }).level;
  const gameIndexRaw = (req.body as { gameIndex?: unknown }).gameIndex;

  const level = typeof levelRaw === 'number' ? Math.floor(levelRaw) : Number(levelRaw);
  const gameIndex = typeof gameIndexRaw === 'number' ? Math.floor(gameIndexRaw) : Number(gameIndexRaw);

  if (!Number.isFinite(level) || level < 1 || level > 5) {
    return res.status(400).json({ error: 'Nivel invalid' });
  }
  if (!Number.isFinite(gameIndex) || gameIndex < 0 || gameIndex > 99) {
    return res.status(400).json({ error: 'gameIndex invalid' });
  }

  const progress = await prisma.userSoloGameProgress.upsert({
    where: {
      userId_gameType_level_gameIndex: {
        userId: req.userId!,
        gameType: INTEGRAME_SOLO_GAME_TYPE,
        level,
        gameIndex,
      },
    },
    create: {
      userId: req.userId!,
      gameType: INTEGRAME_SOLO_GAME_TYPE,
      level,
      gameIndex,
    },
    update: {
      completedAt: new Date(),
    },
  });

  return res.json({ ok: true, level, gameIndex, completedAt: progress.completedAt });
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

// GET /api/stats/me/game-ratings — ELO/XP/ligă per joc pentru userul curent
// Backfill lazy per gameType: dacă un joc are UserGameStats dar nu are UserGameRating, îl calculează.
router.get('/me/game-ratings', requireAuth, async (req: AuthRequest, res: Response) => {
  const existingRatings = await prisma.userGameRating.findMany({
    where: { userId: req.userId },
  });
  const existingGameTypes = new Set(existingRatings.map((r) => r.gameType));

  // Găsim UserGameStats per joc (sursa cea mai corectă pentru ELO history)
  const allGameStats = await prisma.userGameStats.findMany({
    where: { userId: req.userId },
  });

  // Grupăm per gameType normalizat
  const statsByGame: Record<string, { totalMatches: number; lastElo: number | null }> = {};
  for (const gs of allGameStats) {
    const gt = gs.gameType === 'maze' ? 'labirinturi' : gs.gameType;
    if (!statsByGame[gt]) statsByGame[gt] = { totalMatches: 0, lastElo: null };
    statsByGame[gt].totalMatches += gs.totalMatches;
    // ELO din eloHistory — ultimul entry e cel mai recent
    try {
      const hist: { date: string; rating: number }[] = JSON.parse(gs.eloHistory as string);
      if (hist.length > 0) {
        const lastRating = hist[hist.length - 1].rating;
        if (statsByGame[gt].lastElo === null || lastRating > 0) {
          statsByGame[gt].lastElo = lastRating;
        }
      }
    } catch { /* eloHistory invalid JSON */ }
  }

  // Dacă nu avem UserGameStats (meciuri vechi fără stats), fallback pe MatchPlayer
  if (Object.keys(statsByGame).length === 0) {
    const allMatches = await prisma.match.findMany({
      where: { status: 'finished', players: { some: { userId: req.userId! } } },
      select: { gameType: true },
    });
    for (const m of allMatches) {
      const gt = m.gameType === 'maze' ? 'labirinturi' : m.gameType;
      if (!statsByGame[gt]) statsByGame[gt] = { totalMatches: 0, lastElo: null };
      statsByGame[gt].totalMatches += 1;
    }
  }

  // Distribuim User.xp proporțional pe jocuri
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { xp: true, rating: true } });
  const totalMatchesAllGames = Object.values(statsByGame).reduce((s, g) => s + g.totalMatches, 0);

  for (const [gameType, { totalMatches, lastElo }] of Object.entries(statsByGame)) {
    if (existingGameTypes.has(gameType)) continue; // deja există, nu suprascrie

    // ELO: dacă jocul ăsta are TOATE meciurile userului → folosim User.rating (cel mai actualizat)
    // Altfel folosim ultimul entry din eloHistory
    const isOnlyGame = totalMatchesAllGames === totalMatches;
    const rating = isOnlyGame ? (user?.rating ?? 1000) : (lastElo ?? 1000);
    // XP: distribuim User.xp proporțional după nr. meciuri
    const xpFraction = totalMatchesAllGames > 0 ? totalMatches / totalMatchesAllGames : 1;
    const xp = Math.round((user?.xp ?? 0) * xpFraction);
    const league = systemConfigService.ratingToLeague(rating);

    await prisma.userGameRating.upsert({
      where: { userId_gameType: { userId: req.userId!, gameType } },
      create: { userId: req.userId!, gameType, rating, xp, league },
      update: { rating, xp, league },
    });
  }

  const ratings = await prisma.userGameRating.findMany({
    where: { userId: req.userId },
  });
  return res.json(ratings);
});

// GET /api/stats/xp-history?gameType=integrame
router.get('/xp-history', requireAuth, async (req: AuthRequest, res: Response) => {
  const { gameType } = req.query;

  // 'labirinturi' și 'maze' sunt același joc
  let gameTypeFilter: string | { in: string[] } | undefined;
  if (gameType === 'labirinturi') {
    gameTypeFilter = { in: ['labirinturi', 'maze'] };
  } else if (gameType) {
    gameTypeFilter = gameType as string;
  }

  const players = await prisma.matchPlayer.findMany({
    where: {
      userId: req.userId,
      xpGained: { gt: 0 },
      match: {
        status: 'finished',
        ...(gameTypeFilter ? { gameType: gameTypeFilter } : {}),
      },
    },
    include: {
      match: { select: { finishedAt: true, gameType: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let cumulative = 0;
  const history = players
    .filter((p) => p.match.finishedAt)
    .map((p) => {
      cumulative += p.xpGained;
      return {
        date: p.match.finishedAt!.toISOString(),
        xp: cumulative,
        gained: p.xpGained,
      };
    });

  return res.json({ history, total: cumulative });
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
