import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { MAX_PLAYERS_PER_LEVEL, GameLevel } from '@integrame/shared';

const router = Router();

function toDbGameType(gameType: string): string {
  return gameType === 'labirinturi' ? 'maze' : gameType;
}

// GET /api/invites/match/:matchId/active - active invite for a match
router.get('/match/:matchId/active', requireAuth, async (req: AuthRequest, res: Response) => {
  const matchId = req.params['matchId'];
  if (!matchId) return res.status(400).json({ error: 'Match ID lipsă' });

  const membership = await prisma.matchPlayer.findFirst({
    where: { matchId, userId: req.userId! },
    select: { id: true },
  });

  if (!membership) return res.status(403).json({ error: 'Nu ai acces la acest meci' });

  const invite = await prisma.invite.findFirst({
    where: {
      matchId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!invite) return res.status(404).json({ error: 'Nu există invitație activă' });

  return res.json({
    ...invite,
    inviteUrl: `${(process as NodeJS.Process).env['CLIENT_URL']}/invite/${invite.code}`,
  });
});

// POST /api/invites – create invite link
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    matchId: z.string().optional(),
    gameType: z.string(),
    level: z.coerce.number().int().min(1).max(5),
    ttlSeconds: z.coerce.number().int().min(30).max(600).optional(),
    isAI: z.boolean().optional(),
    aiTheme: z.string().trim().min(1).max(32).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { matchId, gameType, level, ttlSeconds, isAI, aiTheme } = parsed.data as {
    matchId?: string;
    gameType: string;
    level: GameLevel;
    ttlSeconds?: number;
    isAI?: boolean;
    aiTheme?: string;
  };
  const dbGameType = toDbGameType(gameType);
  const maxUses = MAX_PLAYERS_PER_LEVEL[level] - 1;
  const expiresAt = new Date(Date.now() + (ttlSeconds ?? (24 * 60 * 60)) * 1000);

  let resolvedMatchId = matchId ?? null;

  if (!resolvedMatchId) {
    const match = await prisma.match.create({
      data: {
        id: uuidv4(),
        gameType: dbGameType,
        level,
        isAI: !!isAI,
        status: 'waiting',
        players: {
          create: [{ userId: req.userId!, score: 0, xpGained: 0, eloChange: 0 }],
        },
      },
    });
    resolvedMatchId = match.id;
  }

  const invite = await prisma.invite.create({
    data: {
      id: uuidv4(),
      code: uuidv4().split('-')[0].toUpperCase(),
      matchId: resolvedMatchId,
      gameType,
      level,
      createdBy: req.userId!,
      expiresAt,
      maxUses,
    },
  });

  const inviteQuery = new URLSearchParams();
  if (isAI) inviteQuery.set('ai', '1');
  if (aiTheme) inviteQuery.set('theme', aiTheme);
  const inviteQueryString = inviteQuery.toString();

  const hostQuery = new URLSearchParams({
    matchId: resolvedMatchId,
    mode: 'friends',
    inviteExpiresAt: invite.expiresAt.toISOString(),
  });
  if (isAI) {
    hostQuery.set('ai', '1');
    hostQuery.set('level', String(level));
  }
  if (aiTheme) hostQuery.set('theme', aiTheme);

  return res.status(201).json({
    ...invite,
    inviteUrl: `${(process as NodeJS.Process).env['CLIENT_URL']}/invite/${invite.code}${inviteQueryString ? `?${inviteQueryString}` : ''}`,
    hostPlayUrl: `${(process as NodeJS.Process).env['CLIENT_URL']}/games/${gameType}/play?${hostQuery.toString()}`,
  });
});

// GET /api/invites/:code
router.get('/:code', async (req: import('express').Request, res: import('express').Response) => {
  const invite = await prisma.invite.findUnique({
    where: { code: req.params['code'] },
    include: { creator: { select: { id: true, username: true, avatarUrl: true } } },
  });
  if (!invite) return res.status(404).json({ error: 'Invitație invalidă' });
  if (new Date() > invite.expiresAt) return res.status(410).json({ error: 'Invitația a expirat' });
  const usedByArr: string[] = JSON.parse(invite.usedBy as string);
  if (usedByArr.length >= invite.maxUses) return res.status(410).json({ error: 'Invitația este plină' });
  return res.json({ ...invite, usedBy: usedByArr });
});

// POST /api/invites/:code/accept
router.post('/:code/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  const bodySchema = z.object({
    aiTheme: z.string().trim().min(1).max(32).optional(),
    isAI: z.boolean().optional(),
  });
  const bodyParsed = bodySchema.safeParse(req.body ?? {});
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error.flatten() });

  const inv = await prisma.invite.findUnique({ where: { code: req.params['code'] } });
  if (!inv) return res.status(404).json({ error: 'Invitație invalidă' });
  if (new Date() > inv.expiresAt) return res.status(410).json({ error: 'Invitația a expirat' });
  const invUsedBy: string[] = JSON.parse(inv.usedBy as string);
  if (invUsedBy.includes(req.userId!)) return res.status(409).json({ error: 'Deja acceptată' });
  if (invUsedBy.length >= inv.maxUses) return res.status(410).json({ error: 'Invitația este plină' });

  invUsedBy.push(req.userId!);
  await prisma.invite.update({
    where: { id: inv.id },
    data: { usedBy: JSON.stringify(invUsedBy) },
  });
  const invite = inv;

  // Auto-join match if matchId exists
  if (inv.matchId) {
    const match = await prisma.match.findUnique({
      where: { id: inv.matchId },
      select: { isAI: true, level: true },
    });

    const alreadyInMatch = await prisma.matchPlayer.findFirst({
      where: { matchId: inv.matchId, userId: req.userId! },
    });
    if (!alreadyInMatch) {
      await prisma.matchPlayer.create({
        data: { matchId: inv.matchId, userId: req.userId!, score: 0, xpGained: 0, eloChange: 0 },
      });
    }

    const query = new URLSearchParams({
      matchId: inv.matchId,
      mode: 'friends',
    });

    if (match?.isAI || bodyParsed.data.isAI) {
      query.set('ai', '1');
      query.set('level', String(inv.level));
      if (bodyParsed.data.aiTheme) query.set('theme', bodyParsed.data.aiTheme);
    }

    return res.json({ redirectTo: `/games/${inv.gameType}/play?${query.toString()}` });
  }

  return res.json({ redirectTo: `/games/${inv.gameType}/play?level=${inv.level}` });
});

export default router;
