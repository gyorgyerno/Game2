import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import prisma from '../prisma';
import logger from '../logger';
import { config } from '../config';
import { adminAuth, AdminRequest } from '../middleware/adminAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { gameRegistry } from '../games/GameRegistry';
import { simulatedMatchOrchestrator } from '../services/simulatedPlayers/SimulatedMatchOrchestrator';

const router = Router();

function toCanonicalGameType(gameType: string): string {
  if (gameType === 'maze') return 'labirinturi';
  return gameType;
}

// ─── POST /api/admin/login ────────────────────────────────────────────────────
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username si parola sunt obligatorii' });
    return;
  }
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) {
    res.status(401).json({ error: 'Credentiale invalide' });
    return;
  }
  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Credentiale invalide' });
    return;
  }
  const token = jwt.sign(
    { adminId: admin.id, username: admin.username, role: 'admin' },
    config.jwtSecret,
    { expiresIn: '8h' }
  );
  logger.info(`[ADMIN] Login reusit: ${admin.username}`);
  res.json({ token, username: admin.username });
}));

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const [totalUsers, totalMatches, activeMatches, totalInvites, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.match.count(),
    prisma.match.count({ where: { status: { in: ['waiting', 'active', 'countdown'] } } }),
    prisma.invite.count(),
    prisma.user.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);
  res.json({ totalUsers, totalMatches, activeMatches, totalInvites, recentUsers });
}));

// ─── GET /api/admin/simulated-players/health ─────────────────────────────────
router.get('/simulated-players/health', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const [
    simulatedUsers,
    enabledProfiles,
    waitingMatchesWithBots,
    botConfig,
  ] = await Promise.all([
    prisma.user.count({ where: { userType: 'SIMULATED' } }),
    prisma.aIPlayerProfile.count({ where: { enabled: true } }),
    prisma.match.count({
      where: {
        status: 'waiting',
        players: {
          some: {
            user: { userType: 'SIMULATED' },
          },
        },
      },
    }),
    prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } }),
  ]);

  res.json({
    features: config.features,
    botConfig,
    counters: {
      simulatedUsers,
      enabledProfiles,
      waitingMatchesWithBots,
    },
    orchestrator: simulatedMatchOrchestrator.getHealthSnapshot(),
  });
}));

// ─── GET /api/admin/games ────────────────────────────────────────────────────
router.get('/games', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const dbGameTypes = await prisma.gameType.findMany({
    select: { id: true, name: true, description: true, isActive: true, iconUrl: true, displayOrder: true },
  });

  const dbByCanonical = new Map<string, {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
    iconUrl: string | null;
    displayOrder: number | null;
  }>();
  for (const dbGame of dbGameTypes) {
    dbByCanonical.set(toCanonicalGameType(dbGame.id), dbGame);
  }

  const seen = new Set<string>();
  const games = gameRegistry.listAll()
    .map((game, index) => ({ game, index }))
    .filter(({ game }) => {
      const canonical = toCanonicalGameType(game.meta.id);
      if (seen.has(canonical)) return false;
      seen.add(canonical);
      return true;
    })
    .map(({ game, index }) => {
      const canonical = toCanonicalGameType(game.meta.id);
      const dbGame = dbByCanonical.get(canonical);
      return {
        id: canonical,
        name: dbGame?.name || game.meta.name,
        description: dbGame?.description || game.meta.description,
        icon: dbGame?.iconUrl || game.meta.icon,
        isActive: dbGame?.isActive ?? true,
        order: dbGame?.displayOrder ?? (index + 1) * 10,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  res.json({ games });
}));

// ─── PATCH /api/admin/games/:id ──────────────────────────────────────────────
router.patch('/games/:id', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const id = toCanonicalGameType(req.params.id);
  const { isActive } = req.body as { isActive?: boolean };

  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive trebuie să fie boolean' });
    return;
  }

  const known = gameRegistry.listAll().some((game) => toCanonicalGameType(game.meta.id) === id);
  if (!known) {
    res.status(404).json({ error: 'Joc necunoscut' });
    return;
  }

  const gameMeta = gameRegistry.listAll().find((game) => toCanonicalGameType(game.meta.id) === id)?.meta;

  const updated = await prisma.gameType.upsert({
    where: { id },
    create: {
      id,
      name: gameMeta?.name || id,
      description: gameMeta?.description || `Game ${id}`,
      iconUrl: gameMeta?.icon,
      isActive,
    },
    update: {
      isActive,
    },
  });

  logger.info(`[ADMIN] Game toggled: ${id} isActive=${isActive} by ${req.adminUsername}`);
  res.json({ game: updated });
}));

// ─── PATCH /api/admin/games/:id/order ───────────────────────────────────────
router.patch('/games/:id/order', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const id = toCanonicalGameType(req.params.id);
  const { order } = req.body as { order?: number };

  if (!Number.isInteger(order)) {
    res.status(400).json({ error: 'order trebuie să fie număr întreg' });
    return;
  }

  const known = gameRegistry.listAll().some((game) => toCanonicalGameType(game.meta.id) === id);
  if (!known) {
    res.status(404).json({ error: 'Joc necunoscut' });
    return;
  }

  const gameMeta = gameRegistry.listAll().find((game) => toCanonicalGameType(game.meta.id) === id)?.meta;

  const updated = await prisma.gameType.upsert({
    where: { id },
    create: {
      id,
      name: gameMeta?.name || id,
      description: gameMeta?.description || `Game ${id}`,
      iconUrl: gameMeta?.icon,
      isActive: true,
      displayOrder: order,
    },
    update: {
      displayOrder: order,
    },
  });

  logger.info(`[ADMIN] Game order updated: ${id} order=${order} by ${req.adminUsername}`);
  res.json({ game: updated });
}));

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const limit = parseInt((req.query.limit as string) || '20');
  const search = (req.query.search as string) || '';
  const skip = (page - 1) * limit;

  const where = search
    ? { OR: [{ email: { contains: search } }, { username: { contains: search } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, email: true, username: true, avatarUrl: true,
        rating: true, xp: true, league: true, referralCode: true, createdAt: true,
        _count: { select: { matchPlayers: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ users, total, page, totalPages: Math.ceil(total / limit) });
}));

// ─── DELETE /api/admin/users/:id ─────────────────────────────────────────────
router.delete('/users/:id', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  await prisma.matchPlayer.deleteMany({ where: { userId: id } });
  await prisma.userGameStats.deleteMany({ where: { userId: id } });
  await prisma.invite.deleteMany({ where: { createdBy: id } });
  await prisma.user.delete({ where: { id } });
  logger.warn(`[ADMIN] User sters: ${id} de catre ${req.adminUsername}`);
  res.json({ message: 'User sters' });
}));

// ─── PATCH /api/admin/users/:id/reset-rating ──────────────────────────────────
router.patch('/users/:id/reset-rating', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.update({
    where: { id },
    data: { rating: 1000, league: 'bronze' },
  });
  logger.info(`[ADMIN] Rating resetat pentru ${user.username}`);
  res.json({ message: 'Rating resetat la 1000', user });
}));

// ─── PATCH /api/admin/users/:id/set-rating ────────────────────────────────────
router.patch('/users/:id/set-rating', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  const { rating } = req.body as { rating: number };
  const user = await prisma.user.update({
    where: { id },
    data: { rating },
  });
  logger.info(`[ADMIN] Rating setat la ${rating} pentru ${user.username}`);
  res.json({ message: `Rating setat la ${rating}`, user });
}));

// ─── GET /api/admin/invites ───────────────────────────────────────────────────
router.get('/invites', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const [invites, total] = await Promise.all([
    prisma.invite.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { creator: { select: { username: true, email: true } } },
    }),
    prisma.invite.count(),
  ]);
  res.json({ invites, total, page, totalPages: Math.ceil(total / limit) });
}));

// ─── POST /api/admin/invites ──────────────────────────────────────────────────
router.post('/invites', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { gameType, level, maxUses, createdBy } = req.body as {
    gameType: string; level: number; maxUses: number; createdBy: string;
  };
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  const invite = await prisma.invite.create({
    data: {
      code,
      gameType,
      level: level || 1,
      maxUses: maxUses || 1,
      createdBy,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  logger.info(`[ADMIN] Invite creat: ${code}`);
  res.status(201).json(invite);
}));

// ─── DELETE /api/admin/invites/:id ────────────────────────────────────────────
router.delete('/invites/:id', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  await prisma.invite.delete({ where: { id: req.params.id } });
  logger.warn(`[ADMIN] Invite sters: ${req.params.id}`);
  res.json({ message: 'Invite sters' });
}));

// ─── GET /api/admin/matches ────────────────────────────────────────────────────
router.get('/matches', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const status = (req.query.status as string) || '';
  const limit = 20;
  const skip = (page - 1) * limit;
  const where = status ? { status } : {};

  const [matches, total] = await Promise.all([
    prisma.match.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        players: { include: { user: { select: { username: true, avatarUrl: true } } } },
      },
    }),
    prisma.match.count({ where }),
  ]);
  res.json({ matches, total, page, totalPages: Math.ceil(total / limit) });
}));

// ─── GET /api/admin/logs ───────────────────────────────────────────────────────
router.get('/logs', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const lines = parseInt((req.query.lines as string) || '100');
  const level = (req.query.level as string) || 'combined';

  const logDir = path.join(__dirname, '../../logs');
  const today = new Date().toISOString().split('T')[0];
  const filename = level === 'error'
    ? `error-${today}.log`
    : `combined-${today}.log`;
  const logPath = path.join(logDir, filename);

  if (!fs.existsSync(logPath)) {
    res.json({ logs: [], filename });
    return;
  }

  const content = fs.readFileSync(logPath, 'utf-8').trim();
  const allLines = content.split('\n').filter(Boolean);
  const last = allLines.slice(-lines);
  const logs = last.map(line => {
    try { return JSON.parse(line); }
    catch { return { message: line }; }
  });

  res.json({ logs: logs.reverse(), filename });
}));

// ─── POST /api/admin/create ─── (folosit o singura data pentru setup) ─────────
router.post('/create', asyncHandler(async (req: Request, res: Response) => {
  const { username, password, secret } = req.body as {
    username: string; password: string; secret: string;
  };
  // Securizat cu un secret din .env
  if (secret !== process.env.ADMIN_SETUP_SECRET) {
    res.status(403).json({ error: 'Secret invalid' });
    return;
  }
  const existing = await prisma.admin.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: 'Admin deja exista' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.admin.create({ data: { username, passwordHash } });
  logger.info(`[ADMIN] Cont admin creat: ${admin.username}`);
  res.status(201).json({ id: admin.id, username: admin.username });
}));

export default router;
