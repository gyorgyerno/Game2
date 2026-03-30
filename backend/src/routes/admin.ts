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
import { systemConfigService, DEFAULT_ELO, DEFAULT_XP, DEFAULT_LEAGUE, ELO_LIMITS, XP_LIMITS, LEAGUE_LIMITS } from '../services/SystemConfigService';
import { simulatedMatchOrchestrator } from '../services/simulatedPlayers/SimulatedMatchOrchestrator';
import { activityFeedGenerator } from '../services/simulatedPlayers/ActivityFeedGenerator';
import { botChatGenerator } from '../services/simulatedPlayers/BotChatGenerator';
import { runtimeMetricsMonitor } from '../services/simulatedPlayers/RuntimeMetricsMonitor';
import { CHALLENGE_TYPE_DEFS, challengeDescription, ChallengeType } from '../services/BonusChallengeService';

const router = Router();

type SimulatedAlertSeverity = 'warn' | 'critical';

type SimulatedAlert = {
  code: string;
  source: 'runtime' | 'activityFeed' | 'botChat';
  severity: SimulatedAlertSeverity;
  message: string;
  value?: number;
  threshold?: number;
};

function toCanonicalGameType(gameType: string): string {
  if (gameType === 'maze') return 'labirinturi';
  return gameType;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

// ─── GET /api/admin/stats/overview ───────────────────────────────────────────
router.get('/stats/overview', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const period = (req.query as { period?: string }).period ?? 'day';

  let since: Date;
  const now = new Date();
  if (period === 'week') {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'month') {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    // day
    since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // ── Useri totali vs. noi in perioada ──────────────────────────────────────
  const [totalUsers, newUsers, totalRealUsers, totalBots, totalGhosts] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since }, userType: 'REAL' } }),
    prisma.user.count({ where: { userType: 'REAL' } }),
    prisma.user.count({ where: { userType: 'SIMULATED' } }),
    prisma.user.count({ where: { userType: 'GHOST' } }),
  ]);

  // ── Meciuri in perioada ────────────────────────────────────────────────────
  const matchesInPeriod = await prisma.match.findMany({
    where: { createdAt: { gte: since }, status: 'finished' },
    select: { gameType: true, level: true, isAI: true },
  });

  const matchesTotal = matchesInPeriod.length;
  const matchesSolo = matchesInPeriod.filter(m => m.isAI).length;
  const matchesGroup = matchesInPeriod.filter(m => !m.isAI).length;

  // meciuri per joc
  const perGame: Record<string, number> = {};
  for (const m of matchesInPeriod) {
    perGame[m.gameType] = (perGame[m.gameType] ?? 0) + 1;
  }

  // meciuri per nivel
  const perLevel: Record<string, number> = {};
  for (const m of matchesInPeriod) {
    const k = `Nivel ${m.level}`;
    perLevel[k] = (perLevel[k] ?? 0) + 1;
  }

  // unique useri care au jucat in perioada (numai REAL)
  const activePlayers = await prisma.matchPlayer.findMany({
    where: { createdAt: { gte: since }, user: { userType: 'REAL' } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const activePlayersCount = activePlayers.length;

  // useri care au jucat solo vs grup (unici, REAL)
  const soloMatchIds = matchesInPeriod.filter(m => m.isAI).map((_: unknown) => '');
  const soloMatchIdsReal = await prisma.match.findMany({
    where: { createdAt: { gte: since }, status: 'finished', isAI: true },
    select: { id: true },
  });
  const groupMatchIdsReal = await prisma.match.findMany({
    where: { createdAt: { gte: since }, status: 'finished', isAI: false },
    select: { id: true },
  });

  const [soloUniquePlayers, groupUniquePlayers] = await Promise.all([
    prisma.matchPlayer.findMany({
      where: { matchId: { in: soloMatchIdsReal.map(m => m.id) }, user: { userType: 'REAL' } },
      select: { userId: true }, distinct: ['userId'],
    }),
    prisma.matchPlayer.findMany({
      where: { matchId: { in: groupMatchIdsReal.map(m => m.id) }, user: { userType: 'REAL' } },
      select: { userId: true }, distinct: ['userId'],
    }),
  ]);

  // distribuție useri per ligă
  const leagueRaw = await prisma.user.groupBy({
    by: ['league'],
    where: { userType: 'REAL' },
    _count: { id: true },
  });
  const perLeague = Object.fromEntries(leagueRaw.map(r => [r.league, r._count.id]));

  // top 5 useri după rating (reali)
  const topUsers = await prisma.user.findMany({
    where: { userType: 'REAL' },
    orderBy: { rating: 'desc' },
    take: 5,
    select: { username: true, rating: true, league: true, xp: true },
  });

  // serii temporale: useri noi per zi (ultimele 30 zile fix)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentRegistrations = await prisma.user.findMany({
    where: { createdAt: { gte: thirtyDaysAgo }, userType: 'REAL' },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const registrationsByDay: Record<string, number> = {};
  for (const u of recentRegistrations) {
    const d = u.createdAt.toISOString().split('T')[0];
    registrationsByDay[d] = (registrationsByDay[d] ?? 0) + 1;
  }
  const registrationTimeline = Object.entries(registrationsByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // serii temporale: meciuri per zi (ultimele 30 zile fix)
  const recentMatches = await prisma.match.findMany({
    where: { createdAt: { gte: thirtyDaysAgo }, status: 'finished' },
    select: { createdAt: true, gameType: true },
    orderBy: { createdAt: 'asc' },
  });
  const matchesByDay: Record<string, number> = {};
  for (const m of recentMatches) {
    const d = m.createdAt.toISOString().split('T')[0];
    matchesByDay[d] = (matchesByDay[d] ?? 0) + 1;
  }
  const matchTimeline = Object.entries(matchesByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  res.json({
    period,
    users: { total: totalUsers, real: totalRealUsers, bots: totalBots, ghosts: totalGhosts, newInPeriod: newUsers, activePlayers: activePlayersCount },
    matches: { total: matchesTotal, solo: matchesSolo, group: matchesGroup, perGame, perLevel },
    players: { soloUnique: soloUniquePlayers.length, groupUnique: groupUniquePlayers.length },
    perLeague,
    topUsers,
    registrationTimeline,
    matchTimeline,
  });
}));

// ─── GET /api/admin/stats/games-per-day ──────────────────────────────────────
router.get('/stats/games-per-day', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const days = Math.min(90, Math.max(1, parseInt((req.query as { days?: string }).days ?? '30', 10) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: { createdAt: { gte: since }, status: 'finished' },
    select: { gameType: true, createdAt: true },
  });

  const gameTypesSet = new Set<string>();
  const grouped: Record<string, Record<string, number>> = {};

  for (const match of matches) {
    const date = match.createdAt.toISOString().split('T')[0];
    gameTypesSet.add(match.gameType);
    if (!grouped[date]) grouped[date] = {};
    grouped[date][match.gameType] = (grouped[date][match.gameType] ?? 0) + 1;
  }

  const gameTypes = [...gameTypesSet].sort();
  const data = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  res.json({ data, gameTypes, days });
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
    generators: {
      activityFeed: activityFeedGenerator.getStatus(),
      botChat: botChatGenerator.getStatus(),
    },
    runtimeMetrics: runtimeMetricsMonitor.getSnapshot(),
  });
}));

// ─── GET /api/admin/simulated-players/alerts ────────────────────────────────
router.get('/simulated-players/alerts', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const runtime = runtimeMetricsMonitor.getSnapshot();
  const activity = activityFeedGenerator.getStatus();
  const chat = botChatGenerator.getStatus();

  const alerts: SimulatedAlert[] = [];

  if (runtime.eventLoopLagMs >= config.simulatedOps.eventLoopLagAlertMs) {
    alerts.push({
      code: 'runtime_event_loop_lag_high',
      source: 'runtime',
      severity: 'warn',
      message: 'Event loop lag curent peste pragul recomandat.',
      value: runtime.eventLoopLagMs,
      threshold: config.simulatedOps.eventLoopLagAlertMs,
    });
  }

  if (runtime.maxEventLoopLagMs >= config.simulatedOps.eventLoopLagAlertMs * 2) {
    alerts.push({
      code: 'runtime_event_loop_lag_spike',
      source: 'runtime',
      severity: 'critical',
      message: 'Spike major de event loop lag detectat.',
      value: runtime.maxEventLoopLagMs,
      threshold: config.simulatedOps.eventLoopLagAlertMs * 2,
    });
  }

  if (activity.p95DecisionCpuMs >= config.simulatedOps.decisionP95AlertMs) {
    alerts.push({
      code: 'activity_decision_p95_high',
      source: 'activityFeed',
      severity: 'warn',
      message: 'P95 CPU pentru Activity Feed este peste prag.',
      value: activity.p95DecisionCpuMs,
      threshold: config.simulatedOps.decisionP95AlertMs,
    });
  }

  if (chat.p95DecisionCpuMs >= config.simulatedOps.decisionP95AlertMs) {
    alerts.push({
      code: 'chat_decision_p95_high',
      source: 'botChat',
      severity: 'warn',
      message: 'P95 CPU pentru Bot Chat este peste prag.',
      value: chat.p95DecisionCpuMs,
      threshold: config.simulatedOps.decisionP95AlertMs,
    });
  }

  if (activity.totalErrors > 0) {
    alerts.push({
      code: 'activity_errors_detected',
      source: 'activityFeed',
      severity: 'warn',
      message: 'Activity Feed a înregistrat erori la runtime.',
      value: activity.totalErrors,
    });
  }

  if (chat.totalErrors > 0) {
    alerts.push({
      code: 'chat_errors_detected',
      source: 'botChat',
      severity: 'warn',
      message: 'Bot Chat a înregistrat erori la runtime.',
      value: chat.totalErrors,
    });
  }

  if (activity.circuitBreakerActive || activity.consecutiveErrors >= config.simulatedOps.generatorCircuitBreakerConsecutiveErrors) {
    alerts.push({
      code: 'activity_circuit_breaker_active',
      source: 'activityFeed',
      severity: 'critical',
      message: 'Circuit breaker activ pentru Activity Feed.',
      value: activity.consecutiveErrors,
      threshold: config.simulatedOps.generatorCircuitBreakerConsecutiveErrors,
    });
  }

  if (chat.circuitBreakerActive || chat.consecutiveErrors >= config.simulatedOps.generatorCircuitBreakerConsecutiveErrors) {
    alerts.push({
      code: 'chat_circuit_breaker_active',
      source: 'botChat',
      severity: 'critical',
      message: 'Circuit breaker activ pentru Bot Chat.',
      value: chat.consecutiveErrors,
      threshold: config.simulatedOps.generatorCircuitBreakerConsecutiveErrors,
    });
  }

  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length;
  const warnCount = alerts.filter((alert) => alert.severity === 'warn').length;

  res.json({
    alerts,
    summary: {
      healthy: alerts.length === 0,
      warnCount,
      criticalCount,
    },
    thresholds: {
      eventLoopLagAlertMs: config.simulatedOps.eventLoopLagAlertMs,
      decisionP95AlertMs: config.simulatedOps.decisionP95AlertMs,
      circuitBreakerConsecutiveErrors: config.simulatedOps.generatorCircuitBreakerConsecutiveErrors,
    },
  });
}));

// ─── GET /api/admin/simulated-players/feature-status ───────────────────────
router.get('/simulated-players/feature-status', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const botConfig = await prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });

  const configRequested = {
    simPlayers: botConfig?.enabled ?? false,
    chat: botConfig?.chatEnabled ?? false,
    activityFeed: botConfig?.activityFeedEnabled ?? false,
  };

  const runtimeFlags = {
    simPlayers: config.features.simPlayersEnabled,
    ghostPlayers: config.features.ghostPlayersEnabled,
    chat: config.features.botChatEnabled,
    activityFeed: config.features.botActivityFeedEnabled,
  };

  const effective = {
    simPlayers: configRequested.simPlayers && runtimeFlags.simPlayers,
    chat: configRequested.simPlayers && configRequested.chat && runtimeFlags.simPlayers && runtimeFlags.chat,
    activityFeed: configRequested.simPlayers && configRequested.activityFeed && runtimeFlags.simPlayers && runtimeFlags.activityFeed,
  };

  const blockers = {
    simPlayers: effective.simPlayers
      ? []
      : [
          ...(configRequested.simPlayers ? [] : ['db_config_disabled']),
          ...(runtimeFlags.simPlayers ? [] : ['feature_flag_sim_players_disabled']),
        ],
    chat: effective.chat
      ? []
      : [
          ...(configRequested.simPlayers ? [] : ['db_config_sim_players_disabled']),
          ...(configRequested.chat ? [] : ['db_config_chat_disabled']),
          ...(runtimeFlags.simPlayers ? [] : ['feature_flag_sim_players_disabled']),
          ...(runtimeFlags.chat ? [] : ['feature_flag_chat_disabled']),
        ],
    activityFeed: effective.activityFeed
      ? []
      : [
          ...(configRequested.simPlayers ? [] : ['db_config_sim_players_disabled']),
          ...(configRequested.activityFeed ? [] : ['db_config_activity_feed_disabled']),
          ...(runtimeFlags.simPlayers ? [] : ['feature_flag_sim_players_disabled']),
          ...(runtimeFlags.activityFeed ? [] : ['feature_flag_activity_feed_disabled']),
        ],
  };

  res.json({
    configRequested,
    runtimeFlags,
    effective,
    blockers,
  });
}));

// ─── GET /api/admin/simulated-players/config ────────────────────────────────
router.get('/simulated-players/config', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const botConfig = await prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });

  if (botConfig) {
    res.json({ botConfig });
    return;
  }

  const created = await prisma.botConfig.create({
    data: {
      id: 'default-bot-config',
      enabled: false,
      maxBotsOnline: 6,
      botScoreLimit: 5000,
      activityFeedEnabled: false,
      chatEnabled: false,
    },
  });

  res.json({ botConfig: created });
}));

// ─── PATCH /api/admin/simulated-players/config ──────────────────────────────
router.patch('/simulated-players/config', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const {
    enabled,
    maxBotsOnline,
    botScoreLimit,
    activityFeedEnabled,
    chatEnabled,
  } = req.body as {
    enabled?: boolean;
    maxBotsOnline?: number;
    botScoreLimit?: number;
    activityFeedEnabled?: boolean;
    chatEnabled?: boolean;
  };

  if (maxBotsOnline !== undefined && (!Number.isInteger(maxBotsOnline) || maxBotsOnline < 0 || maxBotsOnline > 500)) {
    res.status(400).json({ error: 'maxBotsOnline trebuie să fie integer între 0 și 500' });
    return;
  }

  if (botScoreLimit !== undefined && (!Number.isInteger(botScoreLimit) || botScoreLimit < 0)) {
    res.status(400).json({ error: 'botScoreLimit trebuie să fie integer >= 0' });
    return;
  }

  for (const [key, value] of Object.entries({ enabled, activityFeedEnabled, chatEnabled })) {
    if (value !== undefined && typeof value !== 'boolean') {
      res.status(400).json({ error: `${key} trebuie să fie boolean` });
      return;
    }
  }

  const existing = await prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });
  const targetId = existing?.id ?? 'default-bot-config';

  const updated = await prisma.botConfig.upsert({
    where: { id: targetId },
    create: {
      id: targetId,
      enabled: enabled ?? false,
      maxBotsOnline: maxBotsOnline ?? 6,
      botScoreLimit: botScoreLimit ?? 5000,
      activityFeedEnabled: activityFeedEnabled ?? false,
      chatEnabled: chatEnabled ?? false,
    },
    update: {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(maxBotsOnline !== undefined ? { maxBotsOnline } : {}),
      ...(botScoreLimit !== undefined ? { botScoreLimit } : {}),
      ...(activityFeedEnabled !== undefined ? { activityFeedEnabled } : {}),
      ...(chatEnabled !== undefined ? { chatEnabled } : {}),
    },
  });

  logger.info('[ADMIN] Simulated players config updated', {
    admin: req.adminUsername,
    botConfigId: updated.id,
  });

  res.json({ botConfig: updated });
}));

// ─── GET /api/admin/simulated-players/profiles ──────────────────────────────
router.get('/simulated-players/profiles', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
  const search = ((req.query.search as string) || '').trim();
  const skip = (Math.max(1, page) - 1) * limit;

  const where = search
    ? {
        user: {
          OR: [
            { username: { contains: search } },
            { email: { contains: search } },
          ],
        },
      }
    : {};

  const [profiles, total] = await Promise.all([
    prisma.aIPlayerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            avatarUrl: true,
            userType: true,
            rating: true,
            xp: true,
            league: true,
            _count: { select: { matchPlayers: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.aIPlayerProfile.count({ where }),
  ]);

  res.json({
    profiles,
    page: Math.max(1, page),
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}));

// ─── POST /api/admin/simulated-players/profiles ─────────────────────────────
router.post('/simulated-players/profiles', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const {
    username,
    email,
    avatarUrl,
    skillLevel,
    personality,
    preferredGames,
    enabled,
  } = req.body as {
    username?: string;
    email?: string;
    avatarUrl?: string;
    skillLevel?: number;
    personality?: string;
    preferredGames?: string[];
    enabled?: boolean;
  };

  if (!username || username.trim().length < 3) {
    res.status(400).json({ error: 'username este obligatoriu (minim 3 caractere)' });
    return;
  }

  if (email !== undefined && (!email.includes('@') || email.length < 6)) {
    res.status(400).json({ error: 'email invalid' });
    return;
  }

  const normalizedUsername = username.trim();
  const normalizedEmail = (email && email.trim()) || `sim.${normalizedUsername.toLowerCase()}.${Date.now()}@integrame.local`;
  const normalizedSkill = clampNumber(Number.isFinite(skillLevel as number) ? Number(skillLevel) : 5, 1, 10);
  const normalizedPreferredGames = Array.isArray(preferredGames) ? preferredGames.filter((g) => typeof g === 'string').slice(0, 12) : [];

  const created = await prisma.user.create({
    data: {
      username: normalizedUsername,
      email: normalizedEmail,
      avatarUrl: avatarUrl || null,
      userType: 'SIMULATED',
      rating: 1000,
      xp: 0,
      league: 'bronze',
      aiProfile: {
        create: {
          skillLevel: normalizedSkill,
          thinkingSpeedMsMin: Math.max(1200, 4600 - normalizedSkill * 320),
          thinkingSpeedMsMax: Math.max(2600, 7600 - normalizedSkill * 420),
          mistakeRate: Math.max(0.06, 0.24 - normalizedSkill * 0.02),
          hesitationProbability: Math.max(0.08, 0.28 - normalizedSkill * 0.02),
          correctionProbability: Math.min(0.6, 0.22 + normalizedSkill * 0.03),
          playStyle: (personality || 'CASUAL_PLAYER').toLowerCase(),
          personality: personality || 'CASUAL_PLAYER',
          preferredGames: JSON.stringify(normalizedPreferredGames),
          onlineProbability: 0.35,
          chatProbability: 0.06,
          sessionLengthMin: 8,
          sessionLengthMax: 25,
          activityPattern: JSON.stringify({ activeHours: [10, 11, 12, 18, 19, 20], timezone: 'Europe/Bucharest' }),
          enabled: enabled ?? true,
        },
      },
    },
    include: { aiProfile: true },
  });

  logger.info('[ADMIN] Simulated profile created', {
    admin: req.adminUsername,
    userId: created.id,
    username: created.username,
  });

  res.status(201).json({ profile: created });
}));

// ─── PATCH /api/admin/simulated-players/profiles/:userId ────────────────────
router.patch('/simulated-players/profiles/:userId', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const userId = req.params.userId;
  const {
    username,
    avatarUrl,
    skillLevel,
    thinkingSpeedMsMin,
    thinkingSpeedMsMax,
    mistakeRate,
    hesitationProbability,
    correctionProbability,
    personality,
    preferredGames,
    enabled,
  } = req.body as {
    username?: string;
    avatarUrl?: string | null;
    skillLevel?: number;
    thinkingSpeedMsMin?: number;
    thinkingSpeedMsMax?: number;
    mistakeRate?: number;
    hesitationProbability?: number;
    correctionProbability?: number;
    personality?: string;
    preferredGames?: string[];
    enabled?: boolean;
  };

  const existing = await prisma.aIPlayerProfile.findUnique({ where: { userId } });
  if (!existing) {
    res.status(404).json({ error: 'AI profile inexistent' });
    return;
  }

  if (username !== undefined && username.trim().length < 3) {
    res.status(400).json({ error: 'username invalid (minim 3 caractere)' });
    return;
  }

  const profileUpdate = {
    ...(skillLevel !== undefined ? { skillLevel: clampNumber(skillLevel, 1, 10) } : {}),
    ...(thinkingSpeedMsMin !== undefined ? { thinkingSpeedMsMin: clampNumber(thinkingSpeedMsMin, 250, 20000) } : {}),
    ...(thinkingSpeedMsMax !== undefined ? { thinkingSpeedMsMax: clampNumber(thinkingSpeedMsMax, 300, 25000) } : {}),
    ...(mistakeRate !== undefined ? { mistakeRate: clampNumber(mistakeRate, 0, 1) } : {}),
    ...(hesitationProbability !== undefined ? { hesitationProbability: clampNumber(hesitationProbability, 0, 1) } : {}),
    ...(correctionProbability !== undefined ? { correctionProbability: clampNumber(correctionProbability, 0, 1) } : {}),
    ...(personality !== undefined ? { personality, playStyle: personality.toLowerCase() } : {}),
    ...(preferredGames !== undefined ? { preferredGames: JSON.stringify(preferredGames.filter((g) => typeof g === 'string').slice(0, 12)) } : {}),
    ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
  };

  const [updatedUser, updatedProfile] = await Promise.all([
    prisma.user.update({
      where: { id: userId },
      data: {
        ...(username !== undefined ? { username: username.trim() } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      },
    }),
    prisma.aIPlayerProfile.update({
      where: { userId },
      data: profileUpdate,
    }),
  ]);

  logger.info('[ADMIN] Simulated profile updated', {
    admin: req.adminUsername,
    userId,
  });

  res.json({ user: updatedUser, profile: updatedProfile });
}));

// ─── GET /api/admin/simulated-players/ghost-runs ───────────────────────────
router.get('/simulated-players/ghost-runs', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
  const search = ((req.query.search as string) || '').trim();
  const gameType = ((req.query.gameType as string) || '').trim();
  const skip = (Math.max(1, page) - 1) * limit;

  const where = {
    ...(gameType ? { gameType } : {}),
    ...(search ? {
      player: {
        OR: [
          { username: { contains: search } },
          { email: { contains: search } },
        ],
      },
    } : {}),
  };

  const [runs, total] = await Promise.all([
    prisma.ghostRun.findMany({
      where,
      include: {
        player: {
          select: {
            id: true,
            username: true,
            email: true,
            userType: true,
            rating: true,
            xp: true,
            league: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.ghostRun.count({ where }),
  ]);

  res.json({
    runs,
    page: Math.max(1, page),
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}));

// ─── DELETE /api/admin/simulated-players/ghost-runs/:id ────────────────────
router.delete('/simulated-players/ghost-runs/:id', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const id = req.params.id;
  const existing = await prisma.ghostRun.findUnique({ where: { id } });

  if (!existing) {
    res.status(404).json({ error: 'Ghost run inexistent' });
    return;
  }

  await prisma.ghostRun.delete({ where: { id } });

  logger.info('[ADMIN] Ghost run deleted', {
    admin: req.adminUsername,
    ghostRunId: id,
  });

  res.json({ ok: true });
}));

// ─── DELETE /api/admin/simulated-players/ghost-runs ────────────────────────
router.delete('/simulated-players/ghost-runs', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const {
    gameType,
    olderThanDays,
  } = req.body as {
    gameType?: string;
    olderThanDays?: number;
  };

  if (olderThanDays !== undefined && (!Number.isInteger(olderThanDays) || olderThanDays < 0 || olderThanDays > 3650)) {
    res.status(400).json({ error: 'olderThanDays trebuie să fie integer între 0 și 3650' });
    return;
  }

  const createdAtFilter = olderThanDays !== undefined
    ? { lt: new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000) }
    : undefined;

  const where = {
    ...(gameType ? { gameType } : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  };

  const result = await prisma.ghostRun.deleteMany({ where });

  logger.info('[ADMIN] Ghost runs bulk cleanup', {
    admin: req.adminUsername,
    gameType: gameType || null,
    olderThanDays: olderThanDays ?? null,
    deletedCount: result.count,
  });

  res.json({ deletedCount: result.count });
}));

// ─── GET /api/admin/simulated-players/audit-trail ──────────────────────────
router.get('/simulated-players/audit-trail', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const lines = Math.min(200, Math.max(1, parseInt((req.query.lines as string) || '30', 10)));

  const logDir = path.join(__dirname, '../../logs');
  const today = new Date().toISOString().split('T')[0];
  const logPath = path.join(logDir, `combined-${today}.log`);

  if (!fs.existsSync(logPath)) {
    res.json({ entries: [] });
    return;
  }

  const content = fs.readFileSync(logPath, 'utf-8').trim();
  const allLines = content.split('\n').filter(Boolean);

  const interestingMessages = [
    '[ADMIN] Simulated players config updated',
    '[ADMIN] Simulated profile created',
    '[ADMIN] Simulated profile updated',
    '[ADMIN] Ghost run deleted',
    '[ADMIN] Ghost runs bulk cleanup',
  ];

  const parsed = allLines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => !!entry);

  const entries = parsed
    .filter((entry) => {
      const message = entry.message;
      if (typeof message !== 'string') return false;
      return interestingMessages.some((token) => message.includes(token));
    })
    .slice(-lines)
    .reverse()
    .map((entry) => ({
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
      level: typeof entry.level === 'string' ? entry.level : null,
      message: typeof entry.message === 'string' ? entry.message : '',
      admin: typeof entry.admin === 'string' ? entry.admin : null,
      userId: typeof entry.userId === 'string' ? entry.userId : null,
      username: typeof entry.username === 'string' ? entry.username : null,
      botConfigId: typeof entry.botConfigId === 'string' ? entry.botConfigId : null,
      ghostRunId: typeof entry.ghostRunId === 'string' ? entry.ghostRunId : null,
      deletedCount: typeof entry.deletedCount === 'number' ? entry.deletedCount : null,
      gameType: typeof entry.gameType === 'string' ? entry.gameType : null,
      olderThanDays: typeof entry.olderThanDays === 'number' ? entry.olderThanDays : null,
    }));

  res.json({ entries });
}));

// ─── GET /api/admin/simulated-players/activity-feed/status ─────────────────
router.get('/simulated-players/activity-feed/status', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const botConfig = await prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });

  const configRequested = {
    enabled: Boolean(botConfig?.enabled && botConfig?.activityFeedEnabled),
  };

  const runtimeFlags = {
    simPlayers: config.features.simPlayersEnabled,
    activityFeed: config.features.botActivityFeedEnabled,
  };

  const effectiveEnabled = configRequested.enabled && runtimeFlags.simPlayers && runtimeFlags.activityFeed;

  res.json({
    configRequested,
    runtimeFlags,
    effectiveEnabled,
    generator: activityFeedGenerator.getStatus(),
  });
}));

// ─── GET /api/admin/simulated-players/activity-feed/events ─────────────────
router.get('/simulated-players/activity-feed/events', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '20', 10);
  res.json({ events: activityFeedGenerator.getRecentEvents(limit) });
}));

// ─── POST /api/admin/simulated-players/activity-feed/generate ──────────────
router.post('/simulated-players/activity-feed/generate', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const event = await activityFeedGenerator.forceGenerate();
  res.json({ event });
}));

// ─── GET /api/admin/simulated-players/bot-chat/status ──────────────────────
router.get('/simulated-players/bot-chat/status', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const botConfig = await prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });

  const configRequested = {
    enabled: Boolean(botConfig?.enabled && botConfig?.chatEnabled),
  };

  const runtimeFlags = {
    simPlayers: config.features.simPlayersEnabled,
    chat: config.features.botChatEnabled,
  };

  const effectiveEnabled = configRequested.enabled && runtimeFlags.simPlayers && runtimeFlags.chat;

  res.json({
    configRequested,
    runtimeFlags,
    effectiveEnabled,
    generator: botChatGenerator.getStatus(),
  });
}));

// ─── GET /api/admin/simulated-players/bot-chat/messages ────────────────────
router.get('/simulated-players/bot-chat/messages', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '20', 10);
  res.json({ messages: botChatGenerator.getRecentMessages(limit) });
}));

// ─── POST /api/admin/simulated-players/bot-chat/generate ───────────────────
router.post('/simulated-players/bot-chat/generate', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const message = await botChatGenerator.forceGenerate();
  res.json({ message });
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
  const userType = (req.query.userType as string) || '';
  const skip = (page - 1) * limit;

  const baseWhere = search
    ? { OR: [{ email: { contains: search } }, { username: { contains: search } }] }
    : {};
  const where = userType ? { ...baseWhere, userType } : baseWhere;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, email: true, username: true, avatarUrl: true,
        rating: true, xp: true, league: true, referralCode: true, createdAt: true,
        userType: true, isBanned: true, lastIp: true,
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

// ─── PATCH /api/admin/users/:id/toggle-ban ────────────────────────────────────
router.patch('/users/:id/toggle-ban', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) { res.status(404).json({ error: 'User inexistent' }); return; }
  const newBanned = !user.isBanned;
  const updated = await prisma.user.update({
    where: { id },
    data: { isBanned: newBanned },
  });

  // Auto-ban/unban IP if we have it
  if (user.lastIp && user.lastIp !== 'unknown') {
    if (newBanned) {
      await prisma.bannedIP.upsert({
        where: { ip: user.lastIp },
        update: { bannedUserId: id, reason: 'ban_user' },
        create: { ip: user.lastIp, bannedUserId: id, reason: 'ban_user' },
      });
    } else {
      await prisma.bannedIP.deleteMany({ where: { bannedUserId: id } });
    }
  }

  logger.warn(`[ADMIN] User ${newBanned ? 'banat' : 'debanat'}: ${updated.username} (IP: ${user.lastIp || 'necunoscut'}) de catre ${req.adminUsername}`);
  res.json({ message: newBanned ? 'User banat + IP blocat' : 'User debanat + IP deblocat', isBanned: newBanned, ip: user.lastIp });
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

// ─── GET /api/admin/scoring-configs ──────────────────────────────────────────
// Returnează toate jocurile cu regulile lor default (din cod) + override-urile din DB.
router.get('/scoring-configs', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const [dbConfigs, matchLevels] = await Promise.all([
    prisma.gameScoringConfig.findMany({
      orderBy: [{ gameType: 'asc' }, { level: 'asc' }],
    }),
    prisma.match.findMany({
      distinct: ['gameType', 'level'],
      select: { gameType: true, level: true },
    }),
  ]);

  // Build map: gameType → sorted unique levels that have been played
  const levelsByGame = new Map<string, number[]>();
  for (const m of matchLevels) {
    const existing = levelsByGame.get(m.gameType) ?? [];
    existing.push(m.level);
    levelsByGame.set(m.gameType, existing);
  }

  const seen = new Set<string>();
  const result = gameRegistry.listAll()
    .filter((game) => {
      const canonical = toCanonicalGameType(game.meta.id);
      if (seen.has(canonical)) return false;
      seen.add(canonical);
      return true;
    })
    .map((game) => {
      const canonical = toCanonicalGameType(game.meta.id);
      const gameConfigs = dbConfigs.filter((c) => c.gameType === canonical);
      const rawLevels = levelsByGame.get(canonical) ?? [];
      const availableLevels = [...new Set(rawLevels)].sort((a, b) => a - b);
      return {
        gameType: canonical,
        name: game.meta.name,
        icon: game.meta.icon,
        primaryColor: game.meta.primaryColor,
        defaultRules: game.rules,
        availableLevels,
        overrides: gameConfigs.map((c) => ({
          id: c.id,
          level: c.level,
          pointsPerCorrect:   c.pointsPerCorrect,
          pointsPerMistake:   c.pointsPerMistake,
          bonusFirstFinisher: c.bonusFirstFinisher,
          bonusCompletion:    c.bonusCompletion,
          timeLimitSeconds:   c.timeLimitSeconds,
          forfeitBonus:       c.forfeitBonus,
          updatedBy:          c.updatedBy,
          updatedAt:          c.updatedAt,
        })),
      };
    });

  res.json({ configs: result });
}));

// ─── PATCH /api/admin/scoring-configs/:gameType ───────────────────────────────
// Salvează (sau actualizează) un override pentru un joc + nivel opțional.
// Body: { level?: number | null, pointsPerCorrect?: number, ... }
router.patch('/scoring-configs/:gameType', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const gameType = toCanonicalGameType(req.params.gameType);

  if (!gameRegistry.isRegistered(gameType)) {
    res.status(404).json({ error: 'Joc necunoscut' });
    return;
  }

  const {
    level,
    pointsPerCorrect,
    pointsPerMistake,
    bonusFirstFinisher,
    bonusCompletion,
    timeLimitSeconds,
    forfeitBonus,
  } = req.body as {
    level?: number | null;
    pointsPerCorrect?: number;
    pointsPerMistake?: number;
    bonusFirstFinisher?: number;
    bonusCompletion?: number;
    timeLimitSeconds?: number;
    forfeitBonus?: number;
  };

  const normalizedLevel = (level !== undefined && level !== null) ? Math.max(1, Math.floor(Number(level))) : null;

  // Validare câmpuri numerice
  const numFields: Array<[string, number | undefined]> = [
    ['pointsPerCorrect', pointsPerCorrect],
    ['pointsPerMistake', pointsPerMistake],
    ['bonusFirstFinisher', bonusFirstFinisher],
    ['bonusCompletion', bonusCompletion],
    ['timeLimitSeconds', timeLimitSeconds],
    ['forfeitBonus', forfeitBonus],
  ];
  for (const [name, val] of numFields) {
    if (val !== undefined && (!Number.isFinite(val) || !Number.isInteger(val))) {
      res.status(400).json({ error: `${name} trebuie să fie număr întreg` });
      return;
    }
  }
  if (timeLimitSeconds !== undefined && timeLimitSeconds !== 0 && timeLimitSeconds < 10) {
    res.status(400).json({ error: 'timeLimitSeconds minim 10 secunde (sau 0 = fără limită)' });
    return;
  }

  const data = {
    gameType,
    level: normalizedLevel,
    ...(pointsPerCorrect   !== undefined ? { pointsPerCorrect }   : {}),
    ...(pointsPerMistake   !== undefined ? { pointsPerMistake }   : {}),
    ...(bonusFirstFinisher !== undefined ? { bonusFirstFinisher } : {}),
    ...(bonusCompletion    !== undefined ? { bonusCompletion }    : {}),
    ...(timeLimitSeconds   !== undefined ? { timeLimitSeconds }   : {}),
    ...(forfeitBonus       !== undefined ? { forfeitBonus }       : {}),
    updatedBy: req.adminUsername,
  };

  // Folosim findFirst + create/update în loc de upsert, deoarece SQLite tratează
  // valorile NULL ca distincte în unique indexes, deci upsert cu level=null nu funcționează.
  const existing = await prisma.gameScoringConfig.findFirst({
    where: { gameType, level: normalizedLevel },
  });

  let saved;
  if (existing) {
    saved = await prisma.gameScoringConfig.update({ where: { id: existing.id }, data });
  } else {
    saved = await prisma.gameScoringConfig.create({ data });
  }

  // Reîncarcă override-urile în memorie
  await gameRegistry.loadScoringOverrides(prisma);

  logger.info('[ADMIN] Scoring config updated', {
    admin: req.adminUsername,
    gameType,
    level: normalizedLevel,
  });

  res.json({ config: saved });
}));

// ─── DELETE /api/admin/scoring-configs/:gameType ─────────────────────────────
// Șterge override-ul pentru un joc + nivel (revert la default-urile din cod).
// Query param: ?level=N (sau fără, pentru override-ul de bază nivel=null)
router.delete('/scoring-configs/:gameType', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const gameType = toCanonicalGameType(req.params.gameType);
  const levelParam = req.query.level as string | undefined;
  const level = levelParam !== undefined ? parseInt(levelParam, 10) : null;

  const existing = await prisma.gameScoringConfig.findFirst({
    where: { gameType, level },
  });

  if (!existing) {
    res.status(404).json({ error: 'Override inexistent' });
    return;
  }

  await prisma.gameScoringConfig.delete({ where: { id: existing.id } });

  // Reîncarcă override-urile în memorie
  await gameRegistry.loadScoringOverrides(prisma);

  logger.info('[ADMIN] Scoring config deleted', {
    admin: req.adminUsername,
    gameType,
    level,
  });

  res.json({ ok: true });
}));

// ─── GET /api/admin/system-config ────────────────────────────────────────────
router.get('/system-config', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  res.json(systemConfigService.getSnapshot());
}));

// ─── PATCH /api/admin/system-config/elo ──────────────────────────────────────
router.patch('/system-config/elo', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { kFactorLow, kFactorMid, kFactorHigh, thresholdMid, thresholdHigh } = req.body as {
    kFactorLow?: number; kFactorMid?: number; kFactorHigh?: number;
    thresholdMid?: number; thresholdHigh?: number;
  };

  const kFields: Array<[string, number | undefined]> = [
    ['kFactorLow', kFactorLow], ['kFactorMid', kFactorMid], ['kFactorHigh', kFactorHigh],
  ];
  for (const [name, val] of kFields) {
    if (val !== undefined) {
      if (!Number.isFinite(val) || !Number.isInteger(val) ||
          val < ELO_LIMITS.kFactor.min || val > ELO_LIMITS.kFactor.max) {
        res.status(400).json({ error: `${name} trebuie să fie integer între ${ELO_LIMITS.kFactor.min} și ${ELO_LIMITS.kFactor.max}` });
        return;
      }
    }
  }
  const tFields: Array<[string, number | undefined]> = [
    ['thresholdMid', thresholdMid], ['thresholdHigh', thresholdHigh],
  ];
  for (const [name, val] of tFields) {
    if (val !== undefined) {
      if (!Number.isFinite(val) || !Number.isInteger(val) ||
          val < ELO_LIMITS.threshold.min || val > ELO_LIMITS.threshold.max) {
        res.status(400).json({ error: `${name} trebuie să fie integer între ${ELO_LIMITS.threshold.min} și ${ELO_LIMITS.threshold.max}` });
        return;
      }
    }
  }

  const current = systemConfigService.getElo();
  const merged = {
    ...current,
    ...(kFactorLow    !== undefined ? { kFactorLow }    : {}),
    ...(kFactorMid    !== undefined ? { kFactorMid }    : {}),
    ...(kFactorHigh   !== undefined ? { kFactorHigh }   : {}),
    ...(thresholdMid  !== undefined ? { thresholdMid }  : {}),
    ...(thresholdHigh !== undefined ? { thresholdHigh } : {}),
  };

  if (merged.thresholdMid >= merged.thresholdHigh) {
    res.status(400).json({ error: 'thresholdMid trebuie să fie mai mic decât thresholdHigh' });
    return;
  }

  await prisma.systemConfig.upsert({
    where: { key: 'elo' },
    create: { key: 'elo', value: JSON.stringify(merged), updatedBy: req.adminUsername },
    update: { value: JSON.stringify(merged), updatedBy: req.adminUsername },
  });
  systemConfigService.setElo(merged);

  logger.info('[ADMIN] SystemConfig ELO updated', { admin: req.adminUsername, merged });
  res.json({ elo: systemConfigService.getElo(), defaults: DEFAULT_ELO });
}));

// ─── PATCH /api/admin/system-config/xp ───────────────────────────────────────
router.patch('/system-config/xp', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { perWin, perLoss, perDraw, bonusTop3 } = req.body as {
    perWin?: number; perLoss?: number; perDraw?: number; bonusTop3?: number;
  };

  const fields: Array<[string, number | undefined, { min: number; max: number }]> = [
    ['perWin',    perWin,    XP_LIMITS.perWin],
    ['perLoss',   perLoss,   XP_LIMITS.perLoss],
    ['perDraw',   perDraw,   XP_LIMITS.perDraw],
    ['bonusTop3', bonusTop3, XP_LIMITS.bonusTop3],
  ];
  for (const [name, val, limits] of fields) {
    if (val !== undefined && (!Number.isFinite(val) || !Number.isInteger(val) || val < limits.min || val > limits.max)) {
      res.status(400).json({ error: `${name} trebuie să fie integer între ${limits.min} și ${limits.max}` });
      return;
    }
  }

  const current = systemConfigService.getXp();
  const merged = {
    ...current,
    ...(perWin    !== undefined ? { perWin }    : {}),
    ...(perLoss   !== undefined ? { perLoss }   : {}),
    ...(perDraw   !== undefined ? { perDraw }   : {}),
    ...(bonusTop3 !== undefined ? { bonusTop3 } : {}),
  };

  await prisma.systemConfig.upsert({
    where: { key: 'xp' },
    create: { key: 'xp', value: JSON.stringify(merged), updatedBy: req.adminUsername },
    update: { value: JSON.stringify(merged), updatedBy: req.adminUsername },
  });
  systemConfigService.setXp(merged);

  logger.info('[ADMIN] SystemConfig XP updated', { admin: req.adminUsername, merged });
  res.json({ xp: systemConfigService.getXp(), defaults: DEFAULT_XP });
}));

// ─── PATCH /api/admin/system-config/league ────────────────────────────────────
router.patch('/system-config/league', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { silver, gold, platinum, diamond } = req.body as {
    silver?: number; gold?: number; platinum?: number; diamond?: number;
  };

  const fields: Array<[string, number | undefined]> = [
    ['silver', silver], ['gold', gold], ['platinum', platinum], ['diamond', diamond],
  ];
  for (const [name, val] of fields) {
    if (val !== undefined && (!Number.isFinite(val) || !Number.isInteger(val) ||
        val < LEAGUE_LIMITS.rating.min || val > LEAGUE_LIMITS.rating.max)) {
      res.status(400).json({ error: `${name} trebuie să fie integer între ${LEAGUE_LIMITS.rating.min} și ${LEAGUE_LIMITS.rating.max}` });
      return;
    }
  }

  const current = systemConfigService.getLeague();
  const merged = {
    ...current,
    ...(silver   !== undefined ? { silver }   : {}),
    ...(gold     !== undefined ? { gold }     : {}),
    ...(platinum !== undefined ? { platinum } : {}),
    ...(diamond  !== undefined ? { diamond }  : {}),
  };

  if (merged.silver >= merged.gold || merged.gold >= merged.platinum || merged.platinum >= merged.diamond) {
    res.status(400).json({ error: 'Pragurile ligilor trebuie să fie în ordine crescătoare: silver < gold < platinum < diamond' });
    return;
  }

  await prisma.systemConfig.upsert({
    where: { key: 'league' },
    create: { key: 'league', value: JSON.stringify(merged), updatedBy: req.adminUsername },
    update: { value: JSON.stringify(merged), updatedBy: req.adminUsername },
  });
  systemConfigService.setLeague(merged);

  logger.info('[ADMIN] SystemConfig League updated', { admin: req.adminUsername, merged });
  res.json({ league: systemConfigService.getLeague(), defaults: DEFAULT_LEAGUE });
}));

// ─── DELETE /api/admin/system-config/:key — reset la default ─────────────────
router.delete('/system-config/:key', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const key = req.params.key;
  if (!['elo', 'xp', 'league'].includes(key)) {
    res.status(400).json({ error: 'Key invalid. Valori acceptate: elo, xp, league' });
    return;
  }

  await prisma.systemConfig.deleteMany({ where: { key } });

  if (key === 'elo')    systemConfigService.setElo({ ...DEFAULT_ELO });
  if (key === 'xp')     systemConfigService.setXp({ ...DEFAULT_XP });
  if (key === 'league') systemConfigService.setLeague({ ...DEFAULT_LEAGUE });

  logger.info(`[ADMIN] SystemConfig ${key} reset la default`, { admin: req.adminUsername });
  res.json({ ok: true, reset: key });
}));

// ─── Level Config endpoints ───────────────────────────────────────────────────
import { gameLevelConfigService } from '../services/GameLevelConfigService';

// GET /api/admin/level-configs/:gameType — toate nivelele unui joc
router.get('/level-configs/:gameType', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { gameType } = req.params as { gameType: string };
  const levels = gameLevelConfigService.getAllLevels(gameType);

  // Numărul de meciuri finalizate per nivel
  const counts = await prisma.match.groupBy({
    by: ['level'],
    where: {
      gameType: { in: [gameType, gameType === 'labirinturi' ? 'maze' : gameType] },
      status: 'finished',
    },
    _count: { id: true },
  });
  const matchCountMap: Record<number, number> = {};
  for (const row of counts) {
    matchCountMap[row.level] = (matchCountMap[row.level] ?? 0) + row._count.id;
  }

  const levelsWithCount = levels.map((l) => ({
    ...l,
    matchCount: matchCountMap[l.level] ?? 0,
  }));

  res.json({ gameType, levels: levelsWithCount });
}));

// PATCH /api/admin/level-configs/:gameType/:level — editează sau creează un nivel
router.patch('/level-configs/:gameType/:level', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { gameType, level: levelStr } = req.params as { gameType: string; level: string };
  const level = parseInt(levelStr, 10);
  if (!Number.isFinite(level) || level < 1 || level > 999) {
    res.status(400).json({ error: 'Nivel invalid (1–999)' });
    return;
  }

  const { displayName, difficultyValue, isActive, maxPlayers, winsToUnlock, gamesPerLevel } = req.body as {
    displayName?: string;
    difficultyValue?: number;
    isActive?: boolean;
    maxPlayers?: number;
    winsToUnlock?: number;
    gamesPerLevel?: number;
  };

  if (difficultyValue !== undefined && (difficultyValue < 0 || difficultyValue > 100)) {
    res.status(400).json({ error: 'difficultyValue trebuie să fie între 0 și 100' });
    return;
  }
  if (maxPlayers !== undefined && (maxPlayers < 1 || maxPlayers > 500)) {
    res.status(400).json({ error: 'maxPlayers trebuie să fie între 1 și 500' });
    return;
  }
  if (winsToUnlock !== undefined && (!Number.isFinite(winsToUnlock) || winsToUnlock < 1 || winsToUnlock > 500)) {
    res.status(400).json({ error: 'winsToUnlock trebuie să fie între 1 și 500' });
    return;
  }
  if (gamesPerLevel !== undefined && (!Number.isFinite(gamesPerLevel) || gamesPerLevel < 1 || gamesPerLevel > 50)) {
    res.status(400).json({ error: 'gamesPerLevel trebuie să fie între 1 și 50' });
    return;
  }

  const data: Record<string, unknown> = {};
  if (displayName   !== undefined) data['displayName']   = String(displayName).slice(0, 100);
  if (difficultyValue !== undefined) data['difficultyValue'] = Math.round(difficultyValue);
  if (isActive      !== undefined) data['isActive']      = Boolean(isActive);
  if (maxPlayers    !== undefined) data['maxPlayers']    = Math.round(maxPlayers);
  if (winsToUnlock  !== undefined) data['winsToUnlock']  = Math.round(winsToUnlock);
  if (gamesPerLevel !== undefined) data['gamesPerLevel'] = Math.round(gamesPerLevel);

  const updated = await gameLevelConfigService.upsertLevel(
    prisma, gameType, level,
    data as Parameters<typeof gameLevelConfigService.upsertLevel>[3],
    req.adminUsername,
  );

  logger.info(`[ADMIN] LevelConfig upsert gameType=${gameType} level=${level}`, { admin: req.adminUsername, data });
  res.json({ ok: true, level: updated });
}));

// DELETE /api/admin/level-configs/:gameType/:level — șterge un nivel
router.delete('/level-configs/:gameType/:level', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { gameType, level: levelStr } = req.params as { gameType: string; level: string };
  const level = parseInt(levelStr, 10);
  if (!Number.isFinite(level) || level < 1) {
    res.status(400).json({ error: 'Nivel invalid' });
    return;
  }

  const deleted = await gameLevelConfigService.deleteLevel(prisma, gameType, level);
  if (!deleted) {
    res.status(404).json({ error: 'Nivelul nu există' });
    return;
  }

  logger.info(`[ADMIN] LevelConfig deleted gameType=${gameType} level=${level}`, { admin: req.adminUsername });
  res.json({ ok: true });
}));

// ─── Bonus Challenges ─────────────────────────────────────────────────────────

// GET /api/admin/bonus-challenges?gameType=integrame
// Returnează challengele active + tipurile disponibile
router.get('/bonus-challenges', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  void reqA;
  const { gameType } = req.query as { gameType?: string };

  const where = gameType
    ? { gameType: { in: [gameType, '*'] } }
    : {};

  const challenges = await prisma.bonusChallenge.findMany({
    where,
    orderBy: [{ gameType: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { awards: true } } },
  });

  const enriched = challenges.map((ch) => ({
    ...ch,
    description: challengeDescription(ch.challengeType as ChallengeType, ch.requiredValue, ch.bonusPoints),
    icon: CHALLENGE_TYPE_DEFS[ch.challengeType as ChallengeType]?.icon ?? '🎯',
    awardsCount: ch._count.awards,
  }));

  res.json({
    challenges: enriched,
    challengeTypes: Object.values(CHALLENGE_TYPE_DEFS).map((d) => ({
      type: d.type,
      label: d.label,
      icon: d.icon,
    })),
  });
}));

// POST /api/admin/bonus-challenges
// Creează un challenge nou
router.post('/bonus-challenges', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  const { gameType, challengeType, label, requiredValue, bonusPoints } = req.body as {
    gameType: string;
    challengeType: string;
    label: string;
    requiredValue: number;
    bonusPoints: number;
  };

  if (!gameType || !challengeType || !label) {
    res.status(400).json({ error: 'gameType, challengeType și label sunt obligatorii' });
    return;
  }
  if (!CHALLENGE_TYPE_DEFS[challengeType as ChallengeType]) {
    res.status(400).json({ error: `Tip de challenge necunoscut: ${challengeType}` });
    return;
  }
  const n = Number(requiredValue);
  const pts = Number(bonusPoints);
  if (!Number.isFinite(n) || n < 1) {
    res.status(400).json({ error: 'requiredValue trebuie să fie minim 1' });
    return;
  }
  if (!Number.isFinite(pts) || pts < 1) {
    res.status(400).json({ error: 'bonusPoints trebuie să fie minim 1' });
    return;
  }

  const ch = await prisma.bonusChallenge.create({
    data: {
      gameType,
      challengeType,
      label: label.trim(),
      requiredValue: n,
      bonusPoints: pts,
      isActive: true,
      createdBy: reqA.adminUsername,
    },
  });

  logger.info('[ADMIN] BonusChallenge created', { id: ch.id, gameType, challengeType, admin: reqA.adminUsername });
  res.status(201).json({
    ...ch,
    description: challengeDescription(ch.challengeType as ChallengeType, ch.requiredValue, ch.bonusPoints),
    icon: CHALLENGE_TYPE_DEFS[ch.challengeType as ChallengeType]?.icon ?? '🎯',
    awardsCount: 0,
  });
}));

// PATCH /api/admin/bonus-challenges/:id
// Editează label, requiredValue, bonusPoints sau toggle isActive
router.patch('/bonus-challenges/:id', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  const { id } = req.params;
  const { label, requiredValue, bonusPoints, isActive } = req.body as Partial<{
    label: string;
    requiredValue: number;
    bonusPoints: number;
    isActive: boolean;
  }>;

  const data: Record<string, unknown> = {};
  if (label       !== undefined) data.label = label.trim();
  if (isActive    !== undefined) data.isActive = Boolean(isActive);
  if (requiredValue !== undefined) {
    const n = Number(requiredValue);
    if (!Number.isFinite(n) || n < 1) { res.status(400).json({ error: 'requiredValue invalid' }); return; }
    data.requiredValue = n;
  }
  if (bonusPoints !== undefined) {
    const pts = Number(bonusPoints);
    if (!Number.isFinite(pts) || pts < 1) { res.status(400).json({ error: 'bonusPoints invalid' }); return; }
    data.bonusPoints = pts;
  }

  const ch = await prisma.bonusChallenge.update({ where: { id }, data });
  logger.info('[ADMIN] BonusChallenge updated', { id, admin: reqA.adminUsername });
  res.json({
    ...ch,
    description: challengeDescription(ch.challengeType as ChallengeType, ch.requiredValue, ch.bonusPoints),
    icon: CHALLENGE_TYPE_DEFS[ch.challengeType as ChallengeType]?.icon ?? '🎯',
  });
}));

// DELETE /api/admin/bonus-challenges/:id
// Șterge un challenge (și toate award-urile aferente prin onDelete: Cascade)
router.delete('/bonus-challenges/:id', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  const { id } = req.params;

  await prisma.bonusChallenge.delete({ where: { id } });
  logger.info('[ADMIN] BonusChallenge deleted', { id, admin: reqA.adminUsername });
  res.json({ ok: true });
}));

export default router;
