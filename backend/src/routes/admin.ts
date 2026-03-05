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
import { activityFeedGenerator } from '../services/simulatedPlayers/ActivityFeedGenerator';
import { botChatGenerator } from '../services/simulatedPlayers/BotChatGenerator';
import { runtimeMetricsMonitor } from '../services/simulatedPlayers/RuntimeMetricsMonitor';

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
