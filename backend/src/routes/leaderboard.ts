import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { ratingToLeague } from '@integrame/shared';

const router = Router();

async function getBotScoreLimit(): Promise<number> {
  const botConfig = await prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });
  return botConfig?.botScoreLimit ?? 5000;
}

// GET /api/leaderboard?gameType=integrame&level=1&filter=global&page=1
router.get('/', async (req: Request, res: Response) => {
  const { gameType, level, filter, page = '1' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10));
  const take = 20;
  const skip = (pageNum - 1) * take;
  const botScoreLimit = await getBotScoreLimit();

  if (gameType) {
    const stats = await prisma.userGameStats.findMany({
      where: {
        gameType: gameType as string,
        ...(level ? { level: parseInt(level as string, 10) } : {}),
        OR: [
          { user: { userType: 'REAL' } },
          { user: { userType: 'SIMULATED' }, totalScore: { lte: botScoreLimit } },
          { user: { userType: 'GHOST' }, totalScore: { lte: botScoreLimit } },
        ],
      },
      include: { user: true },
      orderBy: { totalScore: 'desc' },
      take,
      skip,
    });

    return res.json(
      stats.map((s: any, idx: number) => ({
        rank: skip + idx + 1,
        userId: s.userId,
        username: s.user.username,
        avatarUrl: s.user.avatarUrl,
        rating: s.user.rating,
        xp: s.user.xp,
        wins: s.wins,
        winRate: s.totalMatches > 0 ? +(s.wins / s.totalMatches * 100).toFixed(1) : 0,
        league: ratingToLeague(s.user.rating),
        totalScore: s.totalScore,
      }))
    );
  }

  // Global leaderboard
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { userType: 'REAL' },
        { userType: 'SIMULATED', rating: { lte: botScoreLimit } },
        { userType: 'GHOST', rating: { lte: botScoreLimit } },
      ],
    },
    orderBy: { rating: 'desc' },
    take,
    skip,
    select: { id: true, username: true, avatarUrl: true, rating: true, xp: true, league: true },
  });

  return res.json(
    users.map((u: any, idx: number) => ({
      rank: skip + idx + 1,
      userId: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      rating: u.rating,
      xp: u.xp,
      league: ratingToLeague(u.rating),
    }))
  );
});

export default router;
