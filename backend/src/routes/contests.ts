/**
 * Contest Routes — Public API
 * ────────────────────────────
 * Mount: /api/contests
 *
 * GET  /api/contests/:slug              – detalii contest + status utilizator
 * POST /api/contests/:slug/join         – înregistrare (auth required)
 * GET  /api/contests/:slug/leaderboard  – top jucători cu scor agregat
 * GET  /api/contests/:slug/players      – lista participanți + online status
 */

import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import jwt from 'jsonwebtoken';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { config } from '../config';

// Extrage userId opțional din header-ul Authorization (fără a bloca request-ul)
function extractOptionalUserId(req: Request): string | null {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as { userId: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
}
import { contestEngine } from '../services/ContestEngine';

const router = Router();

// ─── GET /api/contests/:slug ──────────────────────────────────────────────────
// Detalii concurs + statusul utilizatorului curent (dacă e autentificat)
router.get('/:slug', asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;

  const contest = await prisma.contest.findUnique({
    where: { slug },
    include: {
      rounds: { orderBy: { order: 'asc' } },
      _count: { select: { players: true } },
    },
  });

  if (!contest) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }

  // Verificăm dacă userul curent e înregistrat (dacă e autentificat)
  let isRegistered = false;
  const currentUserId = extractOptionalUserId(req);
  if (currentUserId) {
    const player = await prisma.contestPlayer.findUnique({
      where: {
        contestId_userId: { contestId: contest.id, userId: currentUserId },
      },
    });
    isRegistered = !!player;
  }

  const onlinePlayers = contestEngine.getOnlinePlayers(contest.id);

  res.json({
    id: contest.id,
    name: contest.name,
    slug: contest.slug,
    description: contest.description,
    type: contest.type,
    status: contest.status,
    startAt: contest.startAt.toISOString(),
    endAt: contest.endAt.toISOString(),
    maxPlayers: contest.maxPlayers,
    registeredCount: contest._count.players,
    onlineCount: onlinePlayers.length,
    rounds: contest.rounds.map(r => ({ id: r.id, order: r.order, label: r.label, gameType: r.gameType, minLevel: r.minLevel, matchesCount: r.matchesCount })),
    isRegistered,
    isFull: contest.maxPlayers != null && contest._count.players >= contest.maxPlayers,
  });
}));

// ─── POST /api/contests/:slug/join ────────────────────────────────────────────
// Înregistrarea unui utilizator la concurs
router.post('/:slug/join', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const authReq = req as AuthRequest;
  const userId = authReq.userId as string;;

  const contest = await prisma.contest.findUnique({
    where: { slug },
    include: { _count: { select: { players: true } } },
  });

  if (!contest) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }

  if (contest.status === 'ended') {
    res.status(400).json({ error: 'Concursul s-a terminat' });
    return;
  }

  // Verificare maxPlayers
  if (contest.maxPlayers != null && contest._count.players >= contest.maxPlayers) {
    res.status(400).json({ error: 'Concursul este plin' });
    return;
  }

  // Upsert — dacă deja e înregistrat, nu dă eroare
  await prisma.contestPlayer.upsert({
    where: { contestId_userId: { contestId: contest.id, userId } },
    create: { contestId: contest.id, userId },
    update: {},
  });

  res.json({ ok: true, contestId: contest.id });
}));

// ─── GET /api/contests/:slug/leaderboard ──────────────────────────────────────
// Leaderboard agregat (best score per gameType per user)
router.get('/:slug/leaderboard', asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const contest = await prisma.contest.findUnique({ where: { slug }, select: { id: true } });
  if (!contest) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }

  const leaderboard = await contestEngine.getLeaderboard(contest.id);
  res.json({ leaderboard: leaderboard.slice(0, limit) });
}));

// ─── GET /api/contests/:slug/players ─────────────────────────────────────────
// Lista participanților cu info user + online status
router.get('/:slug/players', asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;

  const contest = await prisma.contest.findUnique({ where: { slug }, select: { id: true } });
  if (!contest) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }

  const players = await prisma.contestPlayer.findMany({
    where: { contestId: contest.id },
    orderBy: { joinedAt: 'asc' },
    include: {
      contest: false,
    },
  });

  const userIds = players.map(p => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatarUrl: true, league: true, rating: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));
  const onlineSet = new Set(contestEngine.getOnlinePlayers(contest.id));

  const result = players.map(p => {
    const u = userMap.get(p.userId);
    return {
      userId: p.userId,
      username: u?.username ?? 'Unknown',
      avatarUrl: u?.avatarUrl ?? null,
      league: u?.league ?? 'bronze',
      rating: u?.rating ?? 1000,
      joinedAt: p.joinedAt.toISOString(),
      isOnline: onlineSet.has(p.userId),
    };
  });

  res.json({ players: result, total: result.length });
}));

export default router;
