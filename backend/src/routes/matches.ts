import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
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
  return res.status(201).json(match);
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
