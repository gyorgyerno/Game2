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

// GET /api/leaderboard/global  — top 15 global + rank userul curent
router.get('/global', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId!;
  const TOP = 15;
  const botScoreLimit = await getBotScoreLimit();

  const meUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, avatarUrl: true, rating: true, xp: true },
  });
  if (!meUser) return res.status(401).json({ error: 'User not found' });

  const topUsers = await prisma.user.findMany({
    where: {
      OR: [
        { userType: 'REAL' },
        { userType: 'SIMULATED', rating: { lte: botScoreLimit } },
        { userType: 'GHOST', rating: { lte: botScoreLimit } },
      ],
    },
    orderBy: { rating: 'desc' },
    take: TOP,
    select: { id: true, username: true, avatarUrl: true, rating: true, xp: true },
  });

  const topIds = topUsers.map((u) => u.id);
  const winsAgg = await prisma.userGameStats.groupBy({
    by: ['userId'],
    where: { userId: { in: topIds } },
    _sum: { wins: true },
  });
  const winsMap: Record<string, number> = {};
  for (const w of winsAgg) winsMap[String(w.userId)] = w._sum.wins ?? 0;

  const top = topUsers.map((u, idx) => ({
    rank: idx + 1,
    userId: u.id,
    username: u.username,
    avatarUrl: u.avatarUrl,
    rating: u.rating,
    xp: u.xp,
    wins: winsMap[String(u.id)] ?? 0,
    league: ratingToLeague(u.rating),
    isMe: u.id === meUser.id,
  }));

  const inTop = top.some((e) => e.isMe);
  let myEntry = null;
  if (!inTop) {
    const above = await prisma.user.count({
      where: {
        rating: { gt: meUser.rating },
        OR: [
          { userType: 'REAL' },
          { userType: 'SIMULATED', rating: { lte: botScoreLimit } },
          { userType: 'GHOST', rating: { lte: botScoreLimit } },
        ],
      },
    });
    const myWinsAgg = await prisma.userGameStats.aggregate({
      where: { userId: meUser.id },
      _sum: { wins: true },
    });
    myEntry = {
      rank: above + 1,
      userId: meUser.id,
      username: meUser.username,
      avatarUrl: meUser.avatarUrl,
      rating: meUser.rating,
      xp: meUser.xp,
      wins: myWinsAgg._sum.wins ?? 0,
      league: ratingToLeague(meUser.rating),
      isMe: true,
    };
  }

  return res.json({ top, me: myEntry });
});

export default router;
