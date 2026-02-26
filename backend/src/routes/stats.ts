import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

const router = Router();

// GET /api/stats/me?gameType=integrame&level=1
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const { gameType, level } = req.query;
  const where: Record<string, unknown> = { userId: req.userId };
  if (gameType) where.gameType = gameType;
  if (level) where.level = parseInt(level as string, 10);

  const stats = await prisma.userGameStats.findMany({ where });
  return res.json(stats);
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
