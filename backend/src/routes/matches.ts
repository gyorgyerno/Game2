import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import logger from '../logger';
import { MAX_PLAYERS_PER_LEVEL, GameLevel } from '@integrame/shared';

const router = Router();

// POST /api/matches/find-or-create  – matchmaking
router.post('/find-or-create', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const schema = z.object({
    gameType: z.string(),
    level: z.coerce.number().int().min(1).max(5),
    isAI: z.boolean().default(false),
  });
  const parsed = schema.safeParse((req as import('express').Request).body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { gameType, level, isAI } = parsed.data as { gameType: string; level: GameLevel; isAI: boolean };
  const maxPlayers = MAX_PLAYERS_PER_LEVEL[level];

  // Look for an open match of the same type (AI vs non-AI separate)
  const existing = await prisma.match.findFirst({
    where: {
      gameType,
      level,
      isAI,
      status: 'waiting',
      players: { none: { userId: req.userId } },
    },
    include: { players: true },
  });

  if (existing && existing.players.length < maxPlayers) {
    await prisma.matchPlayer.create({
      data: { matchId: existing.id, userId: req.userId!, score: 0, xpGained: 0, eloChange: 0 },
    });
    const updated = await prisma.match.findUnique({ where: { id: existing.id }, include: { players: { include: { user: true } } } });
    logger.info(`[find-or-create] JOIN existing match=${existing.id} user=${req.userId} players=${updated?.players.length}`);
    return res.json(updated);
  }

  // Create new match
  const match = await prisma.match.create({
    data: {
      id: uuidv4(),
      gameType,
      level,
      isAI,
      status: 'waiting',
      players: {
        create: [{ userId: req.userId!, score: 0, xpGained: 0, eloChange: 0 }],
      },
    },
    include: { players: { include: { user: true } } },
  });
  logger.info(`[find-or-create] CREATE new match=${match.id} user=${req.userId} isAI=${isAI}`);
  return res.status(201).json(match);
});

// POST /api/matches/:id/join  – join via direct link
router.post('/:id/join', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const matchId = (req as import('express').Request).params['id'];
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: true } } },
  });
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.status !== 'waiting') return res.status(409).json({ error: 'Match already started' });

  const maxPlayers = MAX_PLAYERS_PER_LEVEL[match.level as GameLevel];
  const alreadyIn = match.players.find((p: any) => p.userId === req.userId);
  if (alreadyIn) {
    // already a player, just return match
    return res.json(match);
  }
  if (match.players.length >= maxPlayers) return res.status(409).json({ error: 'Match is full' });

  await prisma.matchPlayer.create({
    data: { matchId, userId: req.userId!, score: 0, xpGained: 0, eloChange: 0 },
  });
  const updated = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: true } } },
  });
  logger.info(`[join-direct] user=${req.userId} joined match=${matchId} players=${updated?.players.length}`);
  return res.json(updated);
});

// GET /api/matches/:id
router.get('/:id', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const match = await prisma.match.findUnique({
    where: { id: (req as import('express').Request).params['id'] },
    include: { players: { include: { user: true } } },
  });
  if (!match) return res.status(404).json({ error: 'Match not found' });
  return res.json(match);
});

// GET /api/matches/history/me
router.get('/history/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const matches = await prisma.matchPlayer.findMany({
    where: { userId: req.userId },
    include: { match: { include: { players: { include: { user: true } } } } },
    orderBy: { match: { createdAt: 'desc' } },
    take: 20,
  });
  return res.json(matches.map((mp: any) => mp.match));
});

export default router;
