import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import prisma from '../prisma';
import logger from '../logger';
import { config } from '../config';
import { getOnlineUserCount } from '../socket';
import { adminAuth, AdminRequest } from '../middleware/adminAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { gameRegistry } from '../games/GameRegistry';
import { systemConfigService, DEFAULT_ELO, DEFAULT_XP, DEFAULT_LEAGUE, DEFAULT_UI, DEFAULT_ABANDON, ELO_LIMITS, XP_LIMITS, LEAGUE_LIMITS } from '../services/SystemConfigService';
import { simulatedMatchOrchestrator } from '../services/simulatedPlayers/SimulatedMatchOrchestrator';
import { activityFeedGenerator } from '../services/simulatedPlayers/ActivityFeedGenerator';
import { botChatGenerator } from '../services/simulatedPlayers/BotChatGenerator';
import { runtimeMetricsMonitor } from '../services/simulatedPlayers/RuntimeMetricsMonitor';
import { CHALLENGE_TYPE_DEFS, challengeDescription, ChallengeType } from '../services/BonusChallengeService';
import { contestEngine } from '../services/ContestEngine';

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

// ─── Cache pentru stats/overview (5 min TTL per perioadă) ────────────────────
const _overviewCache = new Map<string, { data: unknown; expiresAt: number }>();

// ─── GET /api/admin/stats/overview ───────────────────────────────────────────
router.get('/stats/overview', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const period = (['day', 'week', 'month'].includes((req.query as { period?: string }).period ?? ''))
    ? ((req.query as { period?: string }).period as string)
    : 'week';

  const cached = _overviewCache.get(period);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const now = new Date();
  const periodMs: Record<string, number> = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 };
  const since = new Date(now.getTime() - periodMs[period]);
  const sinceIso = since.toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const thirtyIso = thirtyDaysAgo.toISOString();

  // ── 1. Contoare useri ─────────────────────────────────────────────────────
  const userTypeCounts = await prisma.user.groupBy({
    by: ['userType'],
    _count: { id: true },
  });
  const userByType = Object.fromEntries(userTypeCounts.map(r => [r.userType, r._count.id]));
  const totalRealUsers = userByType['REAL'] ?? 0;
  const totalBots      = userByType['SIMULATED'] ?? 0;
  const totalGhosts    = userByType['GHOST'] ?? 0;
  const totalUsers     = totalRealUsers + totalBots + totalGhosts;

  const newUsers = await prisma.user.count({ where: { createdAt: { gte: since }, userType: 'REAL' } });

  // ── 2. Meciuri per joc + per nivel (groupBy, fără findMany) ──────────────
  const [matchPerGame, matchPerLevel, matchIsAI] = await Promise.all([
    prisma.match.groupBy({
      by: ['gameType'],
      where: { createdAt: { gte: since }, status: 'finished' },
      _count: { id: true },
    }),
    prisma.match.groupBy({
      by: ['level'],
      where: { createdAt: { gte: since }, status: 'finished' },
      _count: { id: true },
    }),
    prisma.match.groupBy({
      by: ['isAI'],
      where: { createdAt: { gte: since }, status: 'finished' },
      _count: { id: true },
    }),
  ]);

  const perGame: Record<string, number> = Object.fromEntries(matchPerGame.map(r => [r.gameType, r._count.id]));
  const perLevel: Record<string, number> = Object.fromEntries(matchPerLevel.map(r => [`Nivel ${r.level}`, r._count.id]));
  const matchesTotal = matchPerGame.reduce((s, r) => s + r._count.id, 0);
  const matchesSolo  = matchIsAI.find(r => r.isAI)?._count.id ?? 0;
  const matchesGroup = matchIsAI.find(r => !r.isAI)?._count.id ?? 0;

  // ── 3. Jucători activi + unici solo/grup (subquery SQL, fără IN array) ────
  const [activePlayersRes, soloUniqueRes, groupUniqueRes] = await Promise.all([
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT mp.userId) as cnt
      FROM match_players mp
      JOIN users u ON u.id = mp.userId
      WHERE mp.createdAt >= ${sinceIso} AND u.userType = 'REAL'
    `,
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT mp.userId) as cnt
      FROM match_players mp
      JOIN matches m ON m.id = mp.matchId
      JOIN users u ON u.id = mp.userId
      WHERE m.createdAt >= ${sinceIso} AND m.status = 'finished' AND m.isAI = 1 AND u.userType = 'REAL'
    `,
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT mp.userId) as cnt
      FROM match_players mp
      JOIN matches m ON m.id = mp.matchId
      JOIN users u ON u.id = mp.userId
      WHERE m.createdAt >= ${sinceIso} AND m.status = 'finished' AND m.isAI = 0 AND u.userType = 'REAL'
    `,
  ]);
  const activePlayersCount = Number(activePlayersRes[0]?.cnt ?? 0);
  const soloUnique          = Number(soloUniqueRes[0]?.cnt ?? 0);
  const groupUnique         = Number(groupUniqueRes[0]?.cnt ?? 0);

  // ── 4. Distribuție ligi ────────────────────────────────────────────────────
  const leagueRaw = await prisma.user.groupBy({
    by: ['league'],
    where: { userType: 'REAL' },
    _count: { id: true },
  });
  const perLeague = Object.fromEntries(leagueRaw.map(r => [r.league, r._count.id]));

  // ── 5. Top 5 useri ────────────────────────────────────────────────────────
  const topUsers = await prisma.user.findMany({
    where: { userType: 'REAL' },
    orderBy: { rating: 'desc' },
    take: 5,
    select: { username: true, rating: true, league: true, xp: true },
  });

  // ── 6. Timeline înregistrări + meciuri (raw SQL GROUP BY date) ───────────
  const [regTimeline, matchTimeline] = await Promise.all([
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT strftime('%Y-%m-%d', createdAt) as date, COUNT(*) as count
      FROM users
      WHERE createdAt >= ${thirtyIso} AND userType = 'REAL'
      GROUP BY date ORDER BY date ASC
    `,
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT strftime('%Y-%m-%d', createdAt) as date, COUNT(*) as count
      FROM matches
      WHERE createdAt >= ${thirtyIso} AND status = 'finished'
      GROUP BY date ORDER BY date ASC
    `,
  ]);

  const registrationTimeline = regTimeline.map(r => ({ date: r.date, count: Number(r.count) }));
  const matchTimelineFmt     = matchTimeline.map(r => ({ date: r.date, count: Number(r.count) }));

  const payload = {
    period,
    users: { total: totalUsers, real: totalRealUsers, bots: totalBots, ghosts: totalGhosts, newInPeriod: newUsers, activePlayers: activePlayersCount },
    matches: { total: matchesTotal, solo: matchesSolo, group: matchesGroup, perGame, perLevel },
    players: { soloUnique, groupUnique },
    perLeague,
    topUsers,
    registrationTimeline,
    matchTimeline: matchTimelineFmt,
  };

  _overviewCache.set(period, { data: payload, expiresAt: Date.now() + 5 * 60_000 });
  res.json(payload);
}));

// ─── Cache pentru stats/abandon (5 min TTL) ───────────────────────────────────
const _abandonCache = new Map<string, { data: unknown; expiresAt: number }>();

// ─── GET /api/admin/stats/abandon ────────────────────────────────────────────
router.get('/stats/abandon', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const cached = _abandonCache.get('abandon');
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const now = new Date();
  const since7Iso  = new Date(now.getTime() -  7 * 86_400_000).toISOString();
  const since14Iso = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const since30Iso = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  // ── Ferestre per joc + per nivel (groupBy, fără findMany cu JOIN) ─────────
  async function buildWindow(sinceIso: string) {
    const sinceDate = new Date(sinceIso);
    const [byGame, byLevel] = await Promise.all([
      prisma.match.groupBy({
        by: ['gameType', 'isAI'],
        where: { status: 'abandoned', finishedAt: { gte: sinceDate } },
        _count: { id: true },
      }),
      prisma.match.groupBy({
        by: ['level', 'isAI'],
        where: { status: 'abandoned', finishedAt: { gte: sinceDate } },
        _count: { id: true },
      }),
    ]);

    const perGame: Record<string, number> = {};
    const perLevel: Record<string, number> = {};
    let solo = 0, multi = 0;

    for (const r of byGame) {
      perGame[r.gameType] = (perGame[r.gameType] ?? 0) + r._count.id;
      if (r.isAI) solo += r._count.id; else multi += r._count.id;
    }
    for (const r of byLevel) {
      const k = `Nivel ${r.level}`;
      perLevel[k] = (perLevel[k] ?? 0) + r._count.id;
    }
    return { total: solo + multi, solo, multi, perGame, perLevel };
  }

  // ── Top abandoners REAL (raw SQL — evită IN() array uriaș) ──────────────
  type AbandonerRow = { username: string; cnt: bigint };
  const topAbandoners30 = await prisma.$queryRaw<AbandonerRow[]>`
    SELECT u.username, COUNT(*) as cnt
    FROM match_players mp
    JOIN matches m ON m.id = mp.matchId
    JOIN users u ON u.id = mp.userId
    WHERE m.status = 'abandoned'
      AND m.finishedAt >= ${since30Iso}
      AND u.userType = 'REAL'
    GROUP BY mp.userId, u.username
    ORDER BY cnt DESC
    LIMIT 5
  `;
  const topAbandoners = topAbandoners30.map(r => ({ username: r.username, count: Number(r.cnt) }));

  // ── Timeline abandonuri per zi (raw SQL GROUP BY date) ───────────────────
  type TRow = { date: string; count: bigint };
  const timelineRaw = await prisma.$queryRaw<TRow[]>`
    SELECT strftime('%Y-%m-%d', finishedAt) as date, COUNT(*) as count
    FROM matches
    WHERE status = 'abandoned' AND finishedAt >= ${since30Iso}
    GROUP BY date ORDER BY date ASC
  `;
  const timeline = timelineRaw.map(r => ({ date: r.date, count: Number(r.count) }));

  // ── Useri blocați ────────────────────────────────────────────────────────
  const blockedCount = await prisma.user.count({ where: { isBanned: true, userType: 'REAL' } });

  const [w7, w14, w30] = await Promise.all([
    buildWindow(since7Iso),
    buildWindow(since14Iso),
    buildWindow(since30Iso),
  ]);

  const payload = {
    windows: { '7d': w7, '14d': w14, '30d': w30 },
    topAbandoners,
    blockedCount,
    timeline,
  };

  _abandonCache.set('abandon', { data: payload, expiresAt: Date.now() + 5 * 60_000 });
  res.json(payload);
}));

// ─── GET /api/admin/stats/games-per-day ──────────────────────────────────────
router.get('/stats/games-per-day', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const days = Math.min(90, Math.max(1, parseInt((req.query as { days?: string }).days ?? '30', 10) || 30));
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

  type GpdRow = { date: string; gameType: string; count: bigint };
  const rows = await prisma.$queryRaw<GpdRow[]>`
    SELECT strftime('%Y-%m-%d', createdAt) as date, gameType, COUNT(*) as count
    FROM matches
    WHERE createdAt >= ${sinceIso} AND status = 'finished'
    GROUP BY date, gameType
    ORDER BY date ASC
  `;

  const gameTypesSet = new Set<string>();
  const grouped: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    gameTypesSet.add(r.gameType);
    if (!grouped[r.date]) grouped[r.date] = {};
    grouped[r.date][r.gameType] = Number(r.count);
  }

  const gameTypes = [...gameTypesSet].sort();
  const data = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  res.json({ data, gameTypes, days });
}));

// ─── Dashboard cache (10s TTL) ────────────────────────────────────────────────
let _dashboardCache: { data: unknown; expiresAt: number } | null = null;

// ─── GET /api/admin/dashboard ─────────────────────────────────────────────────
router.get('/dashboard', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const now = Date.now();
  if (_dashboardCache && now < _dashboardCache.expiresAt) {
    res.set('X-Cache', 'HIT');
    res.json(_dashboardCache.data);
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const todayIso = todayStart.toISOString();
  const yesterdayIso = yesterdayStart.toISOString();
  const stuckActiveThreshold = new Date(now - 3 * 3600_000);
  const stuckWaitingThreshold = new Date(now - 30 * 60_000);

  const [
    activeMatches, waitingMatches,
    todayUsers, yesterdayUsers,
    todayFinished, yesterdayFinished,
    todayAbandoned,
    stuckActiveCount, stuckWaitingCount,
    platformRows,
  ] = await Promise.all([
    prisma.match.count({ where: { status: { in: ['active', 'countdown'] } } }),
    prisma.match.count({ where: { status: 'waiting' } }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { createdAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.match.count({ where: { status: 'finished', finishedAt: { gte: todayStart } } }),
    prisma.match.count({ where: { status: 'finished', finishedAt: { gte: yesterdayStart, lt: todayStart } } }),
    prisma.match.count({ where: { status: 'abandoned', finishedAt: { gte: todayStart } } }),
    prisma.match.count({ where: { status: 'active', startedAt: { lt: stuckActiveThreshold } } }),
    prisma.match.count({ where: { status: 'waiting', createdAt: { lt: stuckWaitingThreshold } } }),
    prisma.$queryRaw<{ platform: string; count: bigint }[]>`
      SELECT COALESCE(platform, 'web') as platform, COUNT(*) as count
      FROM users GROUP BY COALESCE(platform, 'web')
    `,
  ]);

  const stuckCount = stuckActiveCount + stuckWaitingCount;
  const abandonRate = todayFinished + todayAbandoned > 0
    ? Math.round((todayAbandoned / (todayFinished + todayAbandoned)) * 100)
    : 0;

  const platforms: Record<string, number> = {};
  for (const r of platformRows) platforms[r.platform] = Number(r.count);

  type ActivityRow = { type: string; username: string; description: string; at: string };
  const recentActivity = await prisma.$queryRaw<ActivityRow[]>`
    SELECT type, username, description, at FROM (
      SELECT 'match' as type, u.username, 'Meci terminat' as description, m.finishedAt as at
      FROM matches m
      JOIN match_players mp ON mp.matchId = m.id
      JOIN users u ON u.id = mp.userId
      WHERE m.status = 'finished' AND m.finishedAt IS NOT NULL AND u.userType = 'REAL'
      GROUP BY m.id
      ORDER BY m.finishedAt DESC LIMIT 5
    )
    UNION ALL
    SELECT type, username, description, at FROM (
      SELECT 'user' as type, username, 'Utilizator nou' as description, createdAt as at
      FROM users WHERE userType = 'REAL'
      ORDER BY createdAt DESC LIMIT 5
    )
    ORDER BY at DESC LIMIT 10
  `;

  const payload = {
    live: { onlineUsers: getOnlineUserCount(), activeMatches, waitingMatches },
    today: { newUsers: todayUsers, finishedMatches: todayFinished, abandonRate },
    yesterday: { newUsers: yesterdayUsers, finishedMatches: yesterdayFinished },
    alerts: { stuckCount, highAbandon: abandonRate >= 30 },
    platforms,
    recentActivity,
  };

  _dashboardCache = { data: payload, expiresAt: now + 10_000 };
  res.json(payload);
}));

// ─── Peak-hours cache (1h TTL) ────────────────────────────────────────────────
let _peakHoursCache: { data: unknown; expiresAt: number } | null = null;

// ─── GET /api/admin/stats/peak-hours ─────────────────────────────────────────
router.get('/stats/peak-hours', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const now = Date.now();
  if (_peakHoursCache && now < _peakHoursCache.expiresAt) {
    res.set('X-Cache', 'HIT');
    res.json(_peakHoursCache.data);
    return;
  }

  type HourRow = { hour: string; count: bigint };
  const rows = await prisma.$queryRaw<HourRow[]>`
    SELECT strftime('%H', finishedAt) as hour, COUNT(*) as count
    FROM matches WHERE status = 'finished' AND finishedAt IS NOT NULL
    GROUP BY hour ORDER BY hour ASC
  `;

  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0');
    const row = rows.find(r => r.hour === h);
    return { hour: i, count: row ? Number(row.count) : 0 };
  });

  const data = { hours };
  _peakHoursCache = { data, expiresAt: now + 3_600_000 };
  res.json(data);
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
// Count cache: key = serialised where clause, TTL = 30s
const _userCountCache = new Map<string, { count: number; expiresAt: number }>();

router.get('/users', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
  const search = ((req.query.search as string) || '').trim();
  const userType = ((req.query.userType as string) || '').trim();
  const sortBy = ((req.query.sortBy as string) || 'createdAt').trim();
  const sortDir: 'asc' | 'desc' = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc';
  const skip = (page - 1) * limit;

  const baseWhere = search
    ? { OR: [{ email: { contains: search } }, { username: { contains: search } }] }
    : {};
  const where = userType ? { ...baseWhere, userType } : baseWhere;

  // Server-side orderBy
  const SORT_FIELDS = ['createdAt', 'rating', 'xp', 'league'] as const;
  type SortField = typeof SORT_FIELDS[number];
  const orderBy: object = sortBy === 'matches'
    ? { matchPlayers: { _count: sortDir } }
    : SORT_FIELDS.includes(sortBy as SortField)
      ? { [sortBy]: sortDir }
      : { createdAt: 'desc' };

  // Cached count (30s TTL) — avoid full-table scan on every page flip
  const cacheKey = JSON.stringify(where);
  const cached = _userCountCache.get(cacheKey);
  let total: number;
  if (cached && cached.expiresAt > Date.now()) {
    total = cached.count;
  } else {
    total = await prisma.user.count({ where });
    _userCountCache.set(cacheKey, { count: total, expiresAt: Date.now() + 30_000 });
  }

  const users = await prisma.user.findMany({
    where,
    orderBy,
    skip,
    take: limit,
    select: {
      id: true, email: true, username: true, avatarUrl: true,
      rating: true, xp: true, league: true, referralCode: true, createdAt: true,
      userType: true, isBanned: true, lastIp: true,
      _count: { select: { matchPlayers: true } },
    },
  });

  // Abandon count per user (30 zile) — numai pentru userii de pe pagina curentă
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const userIds = users.map(u => u.id);
  const abandonCfg = systemConfigService.getAbandon();
  const rawGameTypes = abandonCfg.enabledGameTypes ?? [];
  // Normalizează alias-urile: 'labirinturi' → 'maze' (DB stochează 'maze')
  const normalizeGT = (g: string) => g === 'labirinturi' ? 'maze' : g;
  const enabledGameTypes = [...new Set(rawGameTypes.map(normalizeGT))];
  const abandonRows = await prisma.matchPlayer.findMany({
    where: {
      userId: { in: userIds },
      match: {
        status: 'abandoned',
        finishedAt: { gte: since30 },
        ...(enabledGameTypes.length > 0 ? { gameType: { in: enabledGameTypes } } : {}),
      },
    },
    select: { userId: true },
  });
  const abandonMap: Record<string, number> = {};
  for (const row of abandonRows) {
    abandonMap[row.userId] = (abandonMap[row.userId] ?? 0) + 1;
  }
  const usersWithAbandon = users.map(u => ({ ...u, abandonCount30d: abandonMap[u.id] ?? 0 }));

  res.json({ users: usersWithAbandon, total, page, totalPages: Math.ceil(total / limit) });
}));

// ─── DELETE /api/admin/users/:id ─────────────────────────────────────────────
router.delete('/users/:id', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
  if (!user) {
    res.status(404).json({ error: 'User inexistent' });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.friendship.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
    await tx.matchPlayer.deleteMany({ where: { userId: id } });
    await tx.userGameStats.deleteMany({ where: { userId: id } });
    await tx.userSoloGameProgress.deleteMany({ where: { userId: id } });
    await tx.aIPlayerProfile.deleteMany({ where: { userId: id } });
    await tx.playerSkillProfile.deleteMany({ where: { userId: id } });
    await tx.ghostRun.deleteMany({ where: { playerId: id } });
    await tx.bonusChallengeAward.deleteMany({ where: { userId: id } });
    await tx.contestPlayer.deleteMany({ where: { userId: id } });
    await tx.contestScore.deleteMany({ where: { userId: id } });
    await tx.invite.deleteMany({ where: { createdBy: id } });
    await tx.bannedIP.deleteMany({ where: { bannedUserId: id } });
    await tx.user.delete({ where: { id } });
  });

  logger.warn(`[ADMIN] User sters: ${id} de catre ${req.adminUsername}`);
  res.json({ message: 'User sters', user: { id: user.id, username: user.username } });
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

// ─── GET /api/admin/matches/cleanup/preview ──────────────────────────────────
router.get('/matches/cleanup/preview', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const olderThanDays = Math.max(1, Math.min(3650, parseInt((req.query.olderThanDays as string) || '30', 10) || 30));
  const rawStatuses = ((req.query.statuses as string) || 'finished,abandoned').split(',').map(s => s.trim());
  const safeStatuses = rawStatuses.filter(s => ['finished', 'abandoned'].includes(s));
  if (safeStatuses.length === 0) {
    res.status(400).json({ error: 'Cel puțin un status valid (finished, abandoned) este necesar' });
    return;
  }
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const where = { createdAt: { lt: cutoff }, status: { in: safeStatuses } };
  const [count, oldest] = await Promise.all([
    prisma.match.count({ where }),
    prisma.match.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  res.json({
    count,
    oldestDate: oldest?.createdAt ?? null,
    cutoffDate: cutoff,
    olderThanDays,
    statuses: safeStatuses,
  });
}));

// ─── DELETE /api/admin/matches/cleanup ───────────────────────────────────────
router.delete('/matches/cleanup', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { olderThanDays, statuses } = req.body as { olderThanDays?: number; statuses?: string[] };
  if (!Number.isInteger(olderThanDays) || (olderThanDays as number) < 1 || (olderThanDays as number) > 3650) {
    res.status(400).json({ error: 'olderThanDays trebuie să fie integer între 1 și 3650' });
    return;
  }
  if (!Array.isArray(statuses) || statuses.length === 0) {
    res.status(400).json({ error: 'statuses este obligatoriu' });
    return;
  }
  const safeStatuses = statuses.filter(s => ['finished', 'abandoned'].includes(s));
  if (safeStatuses.length === 0) {
    res.status(400).json({ error: 'Statusuri permise: finished, abandoned' });
    return;
  }
  const cutoff = new Date(Date.now() - (olderThanDays as number) * 86_400_000);
  const where = { createdAt: { lt: cutoff }, status: { in: safeStatuses } };

  // Colectăm ID-urile în memorie (UUIDs: ~36 bytes × N)
  const toDelete = await prisma.match.findMany({ where, select: { id: true } });
  const ids = toDelete.map(m => m.id);

  if (ids.length === 0) {
    res.json({ deletedCount: 0 });
    return;
  }

  // Ștergere în fragmente de 500 pentru a evita timeout-urile DB
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await prisma.invite.deleteMany({ where: { matchId: { in: chunk } } });
    await prisma.matchPlayer.deleteMany({ where: { matchId: { in: chunk } } });
    await prisma.match.deleteMany({ where: { id: { in: chunk } } });
  }

  logger.warn(`[ADMIN] Match cleanup: ${ids.length} meciuri șterse (>${olderThanDays}z, status: ${safeStatuses.join(',')}) de ${req.adminUsername}`);
  res.json({ deletedCount: ids.length });
}));

// ─── GET /api/admin/matches ────────────────────────────────────────────────────
// ─── GET /api/admin/matches/stats ────────────────────────────────────────────
const _matchStatsCache = new Map<string, { data: unknown; expiresAt: number }>();

router.get('/matches/stats', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const cacheKey = 'match_stats_today';
  const cached = _matchStatsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [todayTotal, todayFinished, todayAbandoned, activeNow, waitingNow] = await Promise.all([
    prisma.match.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.match.count({ where: { createdAt: { gte: startOfDay }, status: 'finished' } }),
    prisma.match.count({ where: { createdAt: { gte: startOfDay }, status: 'abandoned' } }),
    prisma.match.count({ where: { status: 'active' } }),
    prisma.match.count({ where: { status: 'waiting' } }),
  ]);

  const abandonRate = todayTotal > 0 ? Math.round((todayAbandoned / todayTotal) * 100) : 0;

  const data = { todayTotal, todayFinished, todayAbandoned, activeNow, waitingNow, abandonRate };
  _matchStatsCache.set(cacheKey, { data, expiresAt: Date.now() + 30_000 });
  res.json(data);
}));

// ─── GET /api/admin/matches/stuck ────────────────────────────────────────────
router.get('/matches/stuck', adminAuth, asyncHandler(async (_req: AdminRequest, res: Response) => {
  const activeThreshold  = new Date(Date.now() - 3 * 60 * 60 * 1000);   // >3h active
  const waitingThreshold = new Date(Date.now() - 30 * 60 * 1000);        // >30min waiting

  const [stuckActive, stuckWaiting] = await Promise.all([
    prisma.match.findMany({
      where: { status: 'active', startedAt: { lt: activeThreshold } },
      include: { players: { include: { user: { select: { username: true, userType: true } } } } },
      orderBy: { startedAt: 'asc' },
    }),
    prisma.match.findMany({
      where: { status: 'waiting', createdAt: { lt: waitingThreshold } },
      include: { players: { include: { user: { select: { username: true, userType: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  res.json({
    stuckActive,
    stuckWaiting,
    totalStuck: stuckActive.length + stuckWaiting.length,
  });
}));

// ─── POST /api/admin/matches/stuck/force-abandon ─────────────────────────────
router.post('/matches/stuck/force-abandon', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'ids este obligatoriu (array de string)' });
    return;
  }
  if (ids.length > 500) {
    res.status(400).json({ error: 'Maximum 500 ids per request' });
    return;
  }

  const result = await prisma.match.updateMany({
    where: { id: { in: ids }, status: { in: ['active', 'waiting', 'countdown'] } },
    data: { status: 'abandoned', finishedAt: new Date() },
  });

  logger.warn(`[ADMIN] Force-abandon ${result.count} meciuri stuck de ${req.adminUsername}`);
  res.json({ updatedCount: result.count });
}));

// ─── GET /api/admin/matches ────────────────────────────────────────────────────
router.get('/matches', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const status = ((req.query.status as string) || '').trim();
  const gameType = ((req.query.gameType as string) || '').trim();
  const search = ((req.query.search as string) || '').trim();
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (gameType) where.gameType = gameType;
  if (search) {
    where.players = {
      some: {
        user: {
          OR: [
            { username: { contains: search } },
            { email: { contains: search } },
          ],
        },
      },
    };
  }

  const [matches, total] = await Promise.all([
    prisma.match.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        players: { include: { user: { select: { username: true, avatarUrl: true, userType: true } } } },
      },
    }),
    prisma.match.count({ where }),
  ]);

  // Colectăm gameType-urile unice din DB pentru dropdown filter
  const gameTypes = await prisma.match.findMany({
    select: { gameType: true },
    distinct: ['gameType'],
    orderBy: { gameType: 'asc' },
  });

  res.json({
    matches,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    gameTypes: gameTypes.map(g => g.gameType),
  });
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

// ─── PATCH /api/admin/system-config/ui ───────────────────────────────────────
router.patch('/system-config/ui', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { aiAssistantEnabled } = req.body as { aiAssistantEnabled?: boolean };

  if (aiAssistantEnabled !== undefined && typeof aiAssistantEnabled !== 'boolean') {
    res.status(400).json({ error: 'aiAssistantEnabled trebuie să fie boolean' });
    return;
  }

  const current = systemConfigService.getUi();
  const merged = {
    ...current,
    ...(aiAssistantEnabled !== undefined ? { aiAssistantEnabled } : {}),
  };

  await prisma.systemConfig.upsert({
    where: { key: 'ui' },
    create: { key: 'ui', value: JSON.stringify(merged), updatedBy: req.adminUsername },
    update: { value: JSON.stringify(merged), updatedBy: req.adminUsername },
  });
  systemConfigService.setUi(merged);

  logger.info('[ADMIN] SystemConfig UI updated', { admin: req.adminUsername, merged });
  res.json({ ui: systemConfigService.getUi(), defaults: DEFAULT_UI });
}));

// ─── PATCH /api/admin/system-config/abandon ───────────────────────────────────
router.patch('/system-config/abandon', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { gameType, enabled, autoBlockEnabled, autoBlockThreshold, penaltiesPerLevel } = req.body as {
    gameType?: string;
    enabled?: boolean;
    autoBlockEnabled?: boolean;
    autoBlockThreshold?: number;
    penaltiesPerLevel?: Array<{ level: number; xpPenaltySolo: number; xpPenaltyMulti: number }>;
  };

  const canonicalGameType = gameType ? toCanonicalGameType(gameType) : undefined;
  if (canonicalGameType !== undefined && !gameRegistry.isRegistered(canonicalGameType)) {
    res.status(400).json({ error: 'gameType invalid pentru configurarea abandon' });
    return;
  }

  if (enabled !== undefined && typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled trebuie să fie boolean' }); return;
  }
  if (autoBlockEnabled !== undefined && typeof autoBlockEnabled !== 'boolean') {
    res.status(400).json({ error: 'autoBlockEnabled trebuie să fie boolean' }); return;
  }
  if (autoBlockThreshold !== undefined && (typeof autoBlockThreshold !== 'number' || autoBlockThreshold < 1 || autoBlockThreshold > 100)) {
    res.status(400).json({ error: 'autoBlockThreshold trebuie să fie între 1 și 100' }); return;
  }
  if (penaltiesPerLevel !== undefined) {
    if (!Array.isArray(penaltiesPerLevel)) {
      res.status(400).json({ error: 'penaltiesPerLevel trebuie să fie array' }); return;
    }
    for (const p of penaltiesPerLevel) {
      if (typeof p.level !== 'number' || typeof p.xpPenaltySolo !== 'number' || typeof p.xpPenaltyMulti !== 'number') {
        res.status(400).json({ error: 'Fiecare penalizare trebuie să aibă level, xpPenaltySolo, xpPenaltyMulti numerice' }); return;
      }
      if (p.xpPenaltySolo > 0 || p.xpPenaltyMulti > 0) {
        res.status(400).json({ error: 'Penalizările XP trebuie să fie 0 sau negative' }); return;
      }
    }
  }

  const current = systemConfigService.getAbandon();
  const enabledSet = new Set(current.enabledGameTypes ?? []);
  if (canonicalGameType !== undefined && enabled !== undefined) {
    if (enabled) enabledSet.add(canonicalGameType);
    else enabledSet.delete(canonicalGameType);
  }

  const merged = {
    ...current,
    enabled: enabledSet.size > 0,
    enabledGameTypes: [...enabledSet].sort(),
    ...(autoBlockEnabled !== undefined ? { autoBlockEnabled } : {}),
    ...(autoBlockThreshold !== undefined ? { autoBlockThreshold } : {}),
    ...(penaltiesPerLevel !== undefined ? { penaltiesPerLevel } : {}),
  };

  await prisma.systemConfig.upsert({
    where: { key: 'abandon' },
    create: { key: 'abandon', value: JSON.stringify(merged), updatedBy: req.adminUsername },
    update: { value: JSON.stringify(merged), updatedBy: req.adminUsername },
  });
  systemConfigService.setAbandon(merged);

  logger.info('[ADMIN] SystemConfig Abandon updated', { admin: req.adminUsername, merged });
  res.json({ abandon: systemConfigService.getAbandon(), defaults: DEFAULT_ABANDON });
}));

// ─── DELETE /api/admin/system-config/:key — reset la default ─────────────────
router.delete('/system-config/:key', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const key = req.params.key;
  if (!['elo', 'xp', 'league', 'ui', 'abandon'].includes(key)) {
    res.status(400).json({ error: 'Key invalid. Valori acceptate: elo, xp, league, ui, abandon' });
    return;
  }

  await prisma.systemConfig.deleteMany({ where: { key } });

  if (key === 'elo')     systemConfigService.setElo({ ...DEFAULT_ELO });
  if (key === 'xp')      systemConfigService.setXp({ ...DEFAULT_XP });
  if (key === 'league')  systemConfigService.setLeague({ ...DEFAULT_LEAGUE });
  if (key === 'ui')      systemConfigService.setUi({ ...DEFAULT_UI });
  if (key === 'abandon') systemConfigService.setAbandon({ ...DEFAULT_ABANDON, penaltiesPerLevel: [...DEFAULT_ABANDON.penaltiesPerLevel] });

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

  // Număr jocuri în pool per nivel (MazeTemplate activ)
  const normalizedGT = gameType === 'labirinturi' ? 'maze' : gameType;
  let poolCountMap: Record<number, number> = {};
  if (normalizedGT === 'maze') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const poolRows = await db.mazeTemplate.groupBy({
      by: ['level'],
      where: { isActive: true },
      _count: { id: true },
    });
    for (const row of poolRows) {
      poolCountMap[row.level] = row._count.id;
    }
  }

  const levelsWithMeta = levelsWithCount.map((l) => ({
    ...l,
    poolCount: poolCountMap[l.level] ?? 0,
  }));

  res.json({ gameType, levels: levelsWithMeta });
}));

// PATCH /api/admin/level-configs/:gameType/:level — editează sau creează un nivel
router.patch('/level-configs/:gameType/:level', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { gameType, level: levelStr } = req.params as { gameType: string; level: string };
  const level = parseInt(levelStr, 10);
  if (!Number.isFinite(level) || level < 1 || level > 999) {
    res.status(400).json({ error: 'Nivel invalid (1–999)' });
    return;
  }

  const { displayName, difficultyValue, isActive, maxPlayers, winsToUnlock, gamesPerLevel, aiEnabled, poolSize } = req.body as {
    displayName?: string;
    difficultyValue?: number;
    isActive?: boolean;
    maxPlayers?: number;
    winsToUnlock?: number;
    gamesPerLevel?: number;
    aiEnabled?: boolean;
    poolSize?: number;
  };

  if (difficultyValue !== undefined && (difficultyValue < 0 || difficultyValue > 200)) {
    res.status(400).json({ error: 'difficultyValue trebuie să fie între 0 și 200' });
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
  if (aiEnabled !== undefined) data['aiEnabled'] = Boolean(aiEnabled);
  if (poolSize !== undefined) {
    if (!Number.isFinite(poolSize) || poolSize < 1 || poolSize > 10000) {
      res.status(400).json({ error: 'poolSize trebuie să fie între 1 și 10000' });
      return;
    }
    data['poolSize'] = Math.round(poolSize);
  }

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

// POST /api/admin/level-configs/:gameType/:level/generate-pool
// Generează N seed-uri aleatorii în maze_templates pentru nivelul dat
router.post('/level-configs/:gameType/:level/generate-pool', adminAuth, asyncHandler(async (req: AdminRequest, res: Response) => {
  const { gameType, level: levelStr } = req.params as { gameType: string; level: string };
  const level = parseInt(levelStr, 10);
  if (!Number.isFinite(level) || level < 1) {
    res.status(400).json({ error: 'Nivel invalid' });
    return;
  }

  const normalizedGT = gameType === 'labirinturi' ? 'maze' : gameType;
  if (normalizedGT !== 'maze') {
    res.status(400).json({ error: 'Generarea pool-ului este disponibilă doar pentru jocul Labirint' });
    return;
  }

  const body = req.body as { count?: unknown; shapeVariant?: unknown };
  const count = Math.min(10000, Math.max(1, Math.round(Number(body.count) || 10)));
  const shapeVariant = String(body.shapeVariant || 'rectangle');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  let generated = 0;
  let skipped = 0;
  for (let i = 0; i < count; i++) {
    const seed = Math.floor(Math.random() * 2147483647);
    try {
      await db.mazeTemplate.create({
        data: { level, shapeVariant, seed, source: 'admin', isActive: true, createdBy: req.adminUsername ?? null },
      });
      generated++;
    } catch {
      skipped++; // unique constraint — seed duplicat
    }
  }

  const totalPool = await db.mazeTemplate.count({ where: { level, isActive: true } });
  logger.info(`[ADMIN] generate-pool level=${level} generated=${generated} skipped=${skipped}`, { admin: req.adminUsername });
  res.json({ ok: true, generated, skipped, totalPool });
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

// ─── CONTESTS ADMIN ───────────────────────────────────────────────────────────

// GET /api/admin/contests — lista tuturor concursurilor cu stats
router.get('/contests', adminAuth, asyncHandler(async (_req: Request, res: Response) => {
  const contests = await prisma.contest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rounds: { orderBy: { order: 'asc' } },
      _count: { select: { players: true } },
    },
  });

  const result = contests.map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    type: c.type,
    status: c.status,
    startAt: c.startAt.toISOString(),
    endAt: c.endAt.toISOString(),
    maxPlayers: c.maxPlayers,
    botsCount: c.botsCount,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    registeredCount: c._count.players,
    onlineCount: contestEngine.getOnlinePlayers(c.id).length,
    rounds: c.rounds.map(r => ({ id: r.id, order: r.order, label: r.label, gameType: r.gameType, minLevel: r.minLevel, matchesCount: r.matchesCount })),
  }));

  res.json({ contests: result });
}));

// POST /api/admin/contests — creare concurs nou
router.post('/contests', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  interface RoundInput { order: number; label: string; gameType: string; minLevel: number; matchesCount: number; }
  const { name, slug, description, type, startAt, endAt, maxPlayers, botsCount, forEveryone, rounds } = req.body as {
    name: string;
    slug: string;
    description?: string;
    type?: string;
    startAt: string;
    endAt: string;
    maxPlayers?: number | null;
    botsCount?: number;
    forEveryone?: boolean;
    rounds: RoundInput[];
  };

  if (!name || !slug || !startAt || !endAt || !Array.isArray(rounds) || rounds.length === 0) {
    res.status(400).json({ error: 'name, slug, startAt, endAt, rounds sunt obligatorii' });
    return;
  }

  if (new Date(endAt) <= new Date(startAt)) {
    res.status(400).json({ error: 'endAt trebuie să fie după startAt' });
    return;
  }

  // Verifică slug unic
  const existing = await prisma.contest.findUnique({ where: { slug } });
  if (existing) {
    res.status(409).json({ error: 'Slug-ul este deja folosit' });
    return;
  }

  const contest = await prisma.contest.create({
    data: {
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      description: description ?? '',
      type: type ?? 'public',
      status: 'waiting',
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      maxPlayers: maxPlayers ?? null,
      botsCount: botsCount ?? 0,
      forEveryone: forEveryone ?? false,
      createdBy: reqA.adminUsername ?? 'admin',
      rounds: {
        create: rounds.map((r: RoundInput) => ({
          order: r.order,
          label: r.label,
          gameType: r.gameType,
          minLevel: r.minLevel ?? 1,
          matchesCount: r.matchesCount ?? 1,
        })),
      },
    },
    include: {
      rounds: { orderBy: { order: 'asc' } },
      _count: { select: { players: true } },
    },
  });

  logger.info('[ADMIN] Contest creat', { id: contest.id, slug: contest.slug, admin: reqA.adminUsername });
  res.status(201).json({
    ...contest,
    rounds: contest.rounds.map(r => ({ id: r.id, order: r.order, label: r.label, gameType: r.gameType, minLevel: r.minLevel, matchesCount: r.matchesCount })),
    registeredCount: 0,
    onlineCount: 0,
  });
}));

// PATCH /api/admin/contests/:id — editare concurs
router.patch('/contests/:id', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  const { id } = req.params;
  interface RoundInput { order: number; label: string; gameType: string; minLevel: number; matchesCount: number; }
  const { name, description, type, startAt, endAt, maxPlayers, botsCount, forEveryone, rounds } = req.body as {
    name?: string;
    description?: string;
    type?: string;
    startAt?: string;
    endAt?: string;
    maxPlayers?: number | null;
    botsCount?: number;
    forEveryone?: boolean;
    rounds?: RoundInput[];
  };

  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }

  // Update câmpuri de bază
  const updated = await prisma.contest.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(type && { type }),
      ...(startAt && { startAt: new Date(startAt) }),
      ...(endAt && { endAt: new Date(endAt) }),
      ...(maxPlayers !== undefined && { maxPlayers: maxPlayers ?? null }),
      ...(botsCount !== undefined && { botsCount }),
      ...(forEveryone !== undefined && { forEveryone }),
    },
    include: {
      rounds: { orderBy: { order: 'asc' } },
      _count: { select: { players: true } },
    },
  });

  // Update rounds dacă sunt trimise
  if (Array.isArray(rounds)) {
    await prisma.contestRound.deleteMany({ where: { contestId: id } });
    for (const r of rounds) {
      await prisma.contestRound.create({ data: { contestId: id, order: r.order, label: r.label, gameType: r.gameType, minLevel: r.minLevel ?? 1, matchesCount: r.matchesCount ?? 1 } });
    }
  }

  const finalRounds = Array.isArray(rounds)
    ? rounds
    : updated.rounds.map(r => ({ id: r.id, order: r.order, label: r.label, gameType: r.gameType, minLevel: r.minLevel, matchesCount: r.matchesCount }));

  logger.info('[ADMIN] Contest actualizat', { id, admin: reqA.adminUsername });
  res.json({
    ...updated,
    rounds: finalRounds,
    registeredCount: updated._count.players,
    onlineCount: contestEngine.getOnlinePlayers(id).length,
  });
}));

// DELETE /api/admin/contests/:id — ștergere concurs (cascade pe players/games/scores)
router.delete('/contests/:id', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  const { id } = req.params;

  await prisma.contest.delete({ where: { id } });
  logger.info('[ADMIN] Contest șters', { id, admin: reqA.adminUsername });
  res.json({ ok: true });
}));

// POST /api/admin/contests/:id/force-start — pornire forțată
router.post('/contests/:id/force-start', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  const { id } = req.params;

  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }
  if (contest.status === 'ended') {
    res.status(400).json({ error: 'Concursul s-a terminat deja' });
    return;
  }

  await contestEngine.forceStart(id);
  logger.info('[ADMIN] Contest force-start', { id, admin: reqA.adminUsername });
  res.json({ ok: true, status: 'live' });
}));

// POST /api/admin/contests/:id/force-end — oprire forțată
router.post('/contests/:id/force-end', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const reqA = req as AdminRequest;
  const { id } = req.params;

  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }

  await contestEngine.forceEnd(id);
  logger.info('[ADMIN] Contest force-end', { id, admin: reqA.adminUsername });
  res.json({ ok: true, status: 'ended' });
}));

// GET /api/admin/contests/:id/players — lista participanților cu scoruri complete
router.get('/contests/:id/players', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      rounds: { orderBy: { order: 'asc' } },
      _count: { select: { players: true } },
    },
  });
  if (!contest) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }

  const players = await prisma.contestPlayer.findMany({
    where: { contestId: id },
    orderBy: { joinedAt: 'asc' },
  });

  const scores = await prisma.contestScore.findMany({
    where: { contestId: id },
    orderBy: { createdAt: 'asc' },
  });

  const userIds = players.map(p => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatarUrl: true, league: true, rating: true, xp: true, email: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));
  const onlineSet = new Set(contestEngine.getOnlinePlayers(id));

  // Best scores per (userId, roundId) — top matchesCount per round
  const scoresByRoundUser: Record<string, Record<string, number[]>> = {};
  const allScoresPerUser: Record<string, typeof scores> = {};
  for (const s of scores) {
    if (!allScoresPerUser[s.userId]) allScoresPerUser[s.userId] = [];
    allScoresPerUser[s.userId].push(s);
    if (s.roundId) {
      if (!scoresByRoundUser[s.roundId]) scoresByRoundUser[s.roundId] = {};
      if (!scoresByRoundUser[s.roundId][s.userId]) scoresByRoundUser[s.roundId][s.userId] = [];
      scoresByRoundUser[s.roundId][s.userId].push(s.score);
    }
  }

  const result = players.map(p => {
    const u = userMap.get(p.userId);
    let totalScore = 0;
    const roundScores: Record<string, number> = {};
    for (const round of contest.rounds) {
      const userRoundScores = (scoresByRoundUser[round.id]?.[p.userId] ?? []).sort((a, b) => b - a);
      const best = userRoundScores.slice(0, round.matchesCount).reduce((a, b) => a + b, 0);
      roundScores[round.id] = best;
      totalScore += best;
    }
    const allScores = allScoresPerUser[p.userId] ?? [];
    return {
      userId: p.userId,
      username: u?.username ?? 'Unknown',
      email: u?.email ?? '',
      avatarUrl: u?.avatarUrl ?? null,
      league: u?.league ?? 'bronze',
      rating: u?.rating ?? 1000,
      xp: u?.xp ?? 0,
      joinedAt: p.joinedAt.toISOString(),
      isOnline: onlineSet.has(p.userId),
      totalScore,
      roundScores,
      matchesPlayed: allScores.length,
      scoreHistory: allScores.map(s => ({
        roundId: s.roundId,
        gameType: s.gameType,
        score: s.score,
        level: s.level,
        timeTaken: s.timeTaken,
        matchId: s.matchId,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  });

  // Sortăm după totalScore desc pentru ranking
  result.sort((a, b) => b.totalScore - a.totalScore);
  const withRank = result.map((p, i) => ({ ...p, rank: i + 1 }));

  res.json({
    contest: {
      id: contest.id,
      name: contest.name,
      slug: contest.slug,
      status: contest.status,
      startAt: contest.startAt.toISOString(),
      endAt: contest.endAt.toISOString(),
      maxPlayers: contest.maxPlayers,
      rounds: contest.rounds.map(r => ({ id: r.id, order: r.order, label: r.label, gameType: r.gameType, minLevel: r.minLevel, matchesCount: r.matchesCount })),
    },
    totalRegistered: contest._count.players,
    onlineCount: onlineSet.size,
    players: withRank,
  });
}));

// GET /api/admin/contests/:id/stats — stats sintetice (pentru cardul din admin)
router.get('/contests/:id/stats', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const stats = await contestEngine.getContestStats(id);
  if (!stats) {
    res.status(404).json({ error: 'Concursul nu a fost găsit' });
    return;
  }
  res.json(stats);
}));

export default router;
