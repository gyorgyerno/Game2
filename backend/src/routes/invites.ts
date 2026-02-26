import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { MAX_PLAYERS_PER_LEVEL, GameLevel } from '@integrame/shared';

const router = Router();

// POST /api/invites – create invite link
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    matchId: z.string().optional(),
    gameType: z.string(),
    level: z.coerce.number().int().min(1).max(5),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { matchId, gameType, level } = parsed.data as { matchId?: string; gameType: string; level: GameLevel };
  const maxUses = MAX_PLAYERS_PER_LEVEL[level] - 1;

  const invite = await prisma.invite.create({
    data: {
      id: uuidv4(),
      code: uuidv4().split('-')[0].toUpperCase(),
      matchId: matchId ?? null,
      gameType,
      level,
      createdBy: req.userId!,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      maxUses,
    },
  });

  return res.status(201).json({ ...invite, inviteUrl: `${(process as NodeJS.Process).env['CLIENT_URL']}/invite/${invite.code}` });
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
    const alreadyInMatch = await prisma.matchPlayer.findFirst({
      where: { matchId: inv.matchId, userId: req.userId! },
    });
    if (!alreadyInMatch) {
      await prisma.matchPlayer.create({
        data: { matchId: inv.matchId, userId: req.userId!, score: 0, xpGained: 0, eloChange: 0 },
      });
    }
    return res.json({ redirectTo: `/games/${inv.gameType}/play?matchId=${inv.matchId}` });
  }

  return res.json({ redirectTo: `/games/${inv.gameType}/play?level=${inv.level}` });
});

export default router;
