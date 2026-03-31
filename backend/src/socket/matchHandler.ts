import { Server as SocketServer, Socket } from 'socket.io';
import prisma from '../prisma';
import logger from '../logger';
import {
  SOCKET_EVENTS,
} from '@integrame/shared';
import { gameRegistry } from '../games/GameRegistry';
import { systemConfigService } from '../services/SystemConfigService';
import { config } from '../config';
import { startBotGameplaySimulation } from '../services/simulatedPlayers/BotGameplaySimulator';
import { evaluateChallengesForUser } from '../services/BonusChallengeService';
import { contestEngine } from '../services/ContestEngine';

const countdownTimers: Record<string, ReturnType<typeof setInterval>> = {};
const matchTimers: Record<string, ReturnType<typeof setTimeout>> = {};
// Previne pornirea multiplă a countdown-ului pentru același meci
const countdownStarted: Set<string> = new Set();
// Tracker socket.id → matchId (pentru detectare disconnect)
const socketMatchMap: Map<string, string> = new Map();
const progressRateState: Map<string, { windowStart: number; count: number }> = new Map();
const ghostEventBuffers: Map<string, Array<{ action: string; time: number; score?: number; correctAnswers?: number; mistakes?: number; wallHits?: number }>> = new Map();

const PROGRESS_RATE_WINDOW_MS = 1000;
const PROGRESS_RATE_MAX_PER_WINDOW = 10;
const MAX_GHOST_EVENTS_PER_PLAYER = 300;

type LegacyProgressPayload = {
  matchId: string;
  correctAnswers: number;
  mistakes: number;
};

type GenericProgressPayload = {
  matchId: string;
  metrics?: Record<string, unknown>;
  correctAnswers?: number;
  mistakes?: number;
};

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isMazeGame(gameType: string): boolean {
  return gameType === 'maze' || gameType === 'labirinturi';
}

/** Hash deterministă din matchId → seed uint32.
 *  Același matchId produce mereu același seed → ambii jucători generează același labirint. */
function mazeSeedFromMatchId(matchId: string): number {
  let h = 0x12345678;
  for (let i = 0; i < matchId.length; i++) {
    h = (Math.imul(h, 31) + matchId.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function sanitizeMetrics(metrics: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(metrics).slice(0, 20);
  const safe: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = clampInteger(value, 0, 10000);
      continue;
    }
    if (typeof value === 'boolean') {
      safe[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      safe[key] = value.slice(0, 64);
    }
  }

  return safe;
}

function sanitizeMazeInput(
  metrics: Record<string, unknown>,
  startedAt: Date | null,
  payloadCorrect?: number,
  payloadMistakes?: number,
) {
  const elapsedSec = startedAt
    ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
    : 0;

  const maxStepsByTime = Math.max(25, elapsedSec * 8 + 40);
  const maxWallHitsByTime = Math.max(10, elapsedSec * 6 + 20);
  const maxBonuses = 30;

  const rawSteps = toFiniteNumber(metrics.steps) ?? toFiniteNumber(metrics.progressPoints) ?? 0;
  const rawWallHits = toFiniteNumber(metrics.wallHits) ?? 0;
  const rawBonuses = toFiniteNumber(metrics.bonusesCollected) ?? 0;
  const rawProgressPercent = toFiniteNumber(metrics.progressPercent) ?? 0;

  const steps = clampInteger(rawSteps, 0, maxStepsByTime);
  const wallHits = clampInteger(rawWallHits, 0, maxWallHitsByTime);
  const bonusesCollected = clampInteger(rawBonuses, 0, maxBonuses);
  const progressPercent = clampInteger(rawProgressPercent, 0, 100);

  const computedCorrect = clampInteger(steps + bonusesCollected * 4, 0, maxStepsByTime + maxBonuses * 4);
  const computedMistakes = wallHits;

  const correctAnswers = clampInteger(
    payloadCorrect ?? computedCorrect,
    0,
    maxStepsByTime + maxBonuses * 4,
  );

  const mistakes = clampInteger(
    payloadMistakes ?? computedMistakes,
    0,
    maxWallHitsByTime,
  );

  const normalizedMetrics: Record<string, unknown> = {
    steps,
    wallHits,
    bonusesCollected,
    progressPercent,
  };

  if (typeof metrics.usedCheckpoint === 'boolean') {
    normalizedMetrics.usedCheckpoint = metrics.usedCheckpoint;
  }

  const suspicious =
    rawSteps > maxStepsByTime ||
    rawWallHits > maxWallHitsByTime ||
    rawBonuses > maxBonuses ||
    rawProgressPercent > 100;

  return { correctAnswers, mistakes, metrics: normalizedMetrics, suspicious };
}

function normalizeScoreInput(
  payload: GenericProgressPayload | LegacyProgressPayload,
  gameType: string,
  startedAt: Date | null,
) {
  const rawMetrics = 'metrics' in payload && payload.metrics ? payload.metrics : {};
  const payloadCorrect = toFiniteNumber(payload.correctAnswers);
  const payloadMistakes = toFiniteNumber(payload.mistakes);

  if (isMazeGame(gameType)) {
    return sanitizeMazeInput(rawMetrics, startedAt, payloadCorrect, payloadMistakes);
  }

  const metrics = sanitizeMetrics(rawMetrics);

  const metricsCorrect =
    toFiniteNumber(metrics.correctAnswers) ??
    toFiniteNumber(metrics.progressPoints) ??
    toFiniteNumber(metrics.steps);

  const metricsMistakes =
    toFiniteNumber(metrics.mistakes) ??
    toFiniteNumber(metrics.wallHits);

  const correctAnswers = clampInteger(payloadCorrect ?? metricsCorrect ?? 0, 0, 10000);
  const mistakes = clampInteger(payloadMistakes ?? metricsMistakes ?? 0, 0, 10000);

  return { correctAnswers, mistakes, metrics, suspicious: false };
}

function isProgressRateLimited(socketId: string): boolean {
  const now = Date.now();
  const current = progressRateState.get(socketId);

  if (!current || now - current.windowStart >= PROGRESS_RATE_WINDOW_MS) {
    progressRateState.set(socketId, { windowStart: now, count: 1 });
    return false;
  }

  if (current.count >= PROGRESS_RATE_MAX_PER_WINDOW) {
    return true;
  }

  current.count += 1;
  progressRateState.set(socketId, current);
  return false;
}

function ghostBufferKey(matchId: string, userId: string): string {
  return `${matchId}:${userId}`;
}

function pushGhostEvent(
  matchId: string,
  userId: string,
  action: string,
  startedAt: Date | null,
  payload?: { score?: number; correctAnswers?: number; mistakes?: number; wallHits?: number },
) {
  if (!config.features.ghostPlayersEnabled) return;

  const key = ghostBufferKey(matchId, userId);
  const now = Date.now();
  const relativeSec = startedAt
    ? Number(((now - startedAt.getTime()) / 1000).toFixed(2))
    : 0;

  const current = ghostEventBuffers.get(key) ?? [];
  current.push({
    action,
    time: Math.max(0, relativeSec),
    score: payload?.score,
    correctAnswers: payload?.correctAnswers,
    mistakes: payload?.mistakes,
    wallHits: payload?.wallHits,
  });

  if (current.length > MAX_GHOST_EVENTS_PER_PLAYER) {
    current.splice(0, current.length - MAX_GHOST_EVENTS_PER_PLAYER);
  }

  ghostEventBuffers.set(key, current);
}

function clearGhostBuffersForMatch(matchId: string, userIds: string[]) {
  for (const id of userIds) {
    ghostEventBuffers.delete(ghostBufferKey(matchId, id));
  }
}

async function captureGhostRuns(match: any): Promise<void> {
  if (!config.features.ghostPlayersEnabled) return;
  if (!match) return;

  const startedMs = match.startedAt ? new Date(match.startedAt).getTime() : Date.now();

  for (const player of match.players as Array<any>) {
    if (player.user?.userType !== 'REAL') continue;

    const key = ghostBufferKey(match.id, player.userId);
    const buffered = ghostEventBuffers.get(key) ?? [];

    const events = buffered.length > 0
      ? buffered
      : [{ action: 'finish', time: 0, score: player.score, correctAnswers: player.correctAnswers, mistakes: player.mistakes, wallHits: undefined as number | undefined }];

    const completionTimeSec = player.finishedAt
      ? Math.max(0, Number(((new Date(player.finishedAt).getTime() - startedMs) / 1000).toFixed(2)))
      : 0;

    // Prefer actual wallHits from the finish event (recorded regardless of penalty level)
    const finishEvent = events.slice().reverse().find((e: any) => e.action === 'finish');
    const actualWallHits = typeof finishEvent?.wallHits === 'number'
      ? finishEvent.wallHits
      : player.mistakes ?? 0;

    await prisma.ghostRun.create({
      data: {
        playerId: player.userId,
        gameType: match.gameType,
        difficulty: match.level,
        moves: JSON.stringify(events.map((event: any) => ({
          action: event.action,
          time: event.time,
          score: event.score,
          correctAnswers: event.correctAnswers,
          mistakes: event.mistakes,
        }))),
        timestamps: JSON.stringify(events.map((event: any) => event.time)),
        mistakes: actualWallHits,
        corrections: 0,
        completionTime: completionTimeSec,
        finalScore: player.score ?? 0,
      },
    });
  }

  clearGhostBuffersForMatch(match.id, match.players.map((p: any) => p.userId));
}

export function registerMatchHandlers(io: SocketServer, socket: Socket, userId: string) {
  // ─── Join Match ─────────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.JOIN_MATCH, async ({ matchId }: { matchId: string }) => {
    try {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { players: { include: { user: true } } },
      });

      const roomSockets = await io.in(`match:${matchId}`).allSockets();
      logger.info(`[JOIN_MATCH] user=${userId} matchId=${matchId} DB:status=${match?.status ?? 'NOT_FOUND'} players=${match?.players.length ?? 0} countdownStarted=${countdownStarted.has(matchId)} timerActive=${!!countdownTimers[matchId]} roomBefore=${roomSockets.size}`);

      if (!match) return socket.emit(SOCKET_EVENTS.ERROR, { message: 'Match not found' });

      const room = `match:${matchId}`;
      socket.join(room);
      socketMatchMap.set(socket.id, matchId);

      const roomSocketsAfter = await io.in(room).allSockets();
      logger.info(`[JOIN_MATCH] roomAfterJoin=${roomSocketsAfter.size}`);

      socket.emit(SOCKET_EVENTS.MATCH_STATE, match);

      if (match.status === 'active') {
        logger.info(`[JOIN_MATCH] ACTIV → trimit MATCH_START direct user=${userId}`);
        const seed = isMazeGame(match.gameType) ? mazeSeedFromMatchId(match.id) : undefined;
        socket.emit(SOCKET_EVENTS.MATCH_START, { startedAt: match.startedAt, mazeSeed: seed, timeLimit: gameRegistry.getEffectiveRules(match.gameType, match.level)?.timeLimit ?? 0 });
        return;
      }

      if (match.status === 'countdown') {
        // Re-join room silentios – nu trimitem countdown hardcodat
        // Countdown-ul real se emite prin io.to(room) din setInterval
        logger.info(`[JOIN_MATCH] COUNTDOWN → re-join silentios user=${userId}`);
        return;
      }

      if (match.status !== 'waiting') {
        logger.info(`[JOIN_MATCH] status=${match.status}, ignor user=${userId}`);
        return;
      }

      // Status = waiting
      if (match.players.length < 2) {
        logger.info(`[JOIN_MATCH] Astept jucatori (${match.players.length}/2) matchId=${matchId}`);
        return;
      }

      if (countdownStarted.has(matchId)) {
        logger.warn(`[JOIN_MATCH] Countdown deja marcat timerActive=${!!countdownTimers[matchId]} matchId=${matchId}`);
        return;
      }

      // ─── Start countdown ───────────────────────────────────────────────────
      logger.info(`[JOIN_MATCH] PORNESC COUNTDOWN matchId=${matchId}`);
      countdownStarted.add(matchId);
      await prisma.match.update({ where: { id: matchId }, data: { status: 'countdown' } });

      let countdown = 5;
      countdownTimers[matchId] = setInterval(async () => {
        const socketsNow = await io.in(room).allSockets();
        logger.info(`[COUNTDOWN] tick=${countdown} sockete=${socketsNow.size} matchId=${matchId}`);
        io.to(room).emit(SOCKET_EVENTS.MATCH_COUNTDOWN, { countdown });
        countdown--;
        if (countdown < 0) {
          clearInterval(countdownTimers[matchId]);
          delete countdownTimers[matchId];
          await prisma.match.update({ where: { id: matchId }, data: { status: 'active', startedAt: new Date() } });
          const mazeSeed = isMazeGame(match.gameType) ? mazeSeedFromMatchId(matchId) : undefined;
          const rules = gameRegistry.getEffectiveRules(match.gameType, match.level);
          if (!rules) {
            logger.error('[COUNTDOWN] game rules missing for match', { matchId, gameType: match.gameType });
            io.to(room).emit(SOCKET_EVENTS.ERROR, { message: 'Game rules not found' });
            return;
          }
          io.to(room).emit(SOCKET_EVENTS.MATCH_START, { startedAt: new Date(), mazeSeed, timeLimit: rules.timeLimit });
          logger.info(`[COUNTDOWN] MATCH_START emis room=${room}${mazeSeed !== undefined ? ` mazeSeed=${mazeSeed}` : ''}`);
          // Dacă timeLimit === 0, meciul nu are timer — nu se auto-finalizează
          if (rules.timeLimit > 0) {
            matchTimers[matchId] = setTimeout(() => autoFinishMatch(io, matchId, room), rules.timeLimit * 1000);
          }
          // Pornește simularea gameplay pentru boti (SIMULATED/GHOST)
          startBotGameplaySimulation({
            io,
            matchId,
            room,
            gameType: match.gameType,
            level: match.level,
            // Dacă timeLimit === 0 (nelimitat), botii folosesc 300s ca referință internă
            timeLimit: rules.timeLimit > 0 ? rules.timeLimit : 300,
          }).catch((err) => logger.error('[BOT_SIM] failed to start', { matchId, err }));
        }
      }, 1000);

    } catch (err) {
      logger.error('JOIN_MATCH error', { userId, err });
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Server error' });
    }
  });

  // ─── Player Progress ─────────────────────────────────────────────────────────
  socket.on(
    SOCKET_EVENTS.PLAYER_PROGRESS,
    async (payload: GenericProgressPayload | LegacyProgressPayload) => {
      try {
        if (isProgressRateLimited(socket.id)) {
          logger.warn('[PLAYER_PROGRESS] rate limited', { userId, socketId: socket.id, matchId: payload.matchId });
          return;
        }

        const matchId = payload.matchId;

        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: true },
        });
        if (!match || match.status !== 'active') return;

        const { correctAnswers, mistakes, metrics, suspicious } = normalizeScoreInput(
          payload,
          match.gameType,
          match.startedAt,
        );

        if (suspicious) {
          logger.warn('[PLAYER_PROGRESS] suspicious metrics clamped', {
            userId,
            matchId,
            gameType: match.gameType,
          });
        }

        const liveScore = gameRegistry.calculateLiveScoreForLevel(match.gameType, match.level, correctAnswers, mistakes);

        pushGhostEvent(matchId, userId, 'progress', match.startedAt, {
          score: liveScore,
          correctAnswers,
          mistakes,
        });

        await prisma.matchPlayer.updateMany({
          where: { matchId, userId },
          data: { score: liveScore, correctAnswers, mistakes },
        });

        const updated = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: { include: { user: true } } },
        });

        io.to(`match:${matchId}`).emit(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, {
          userId,
          correctAnswers,
          mistakes,
          metrics,
          liveScore,
          players: updated?.players,
        });
      } catch (err) {
        logger.error('PLAYER_PROGRESS error', { userId, err });
      }
    }
  );

  // ─── Player Finish ───────────────────────────────────────────────────────────
  socket.on(
    SOCKET_EVENTS.PLAYER_FINISH,
    async (payload: GenericProgressPayload | LegacyProgressPayload) => {
      try {
        const matchId = payload.matchId;

        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: { include: { user: true } } },
        });
        if (!match || match.status !== 'active') return;

        const { correctAnswers, mistakes, metrics, suspicious } = normalizeScoreInput(
          payload,
          match.gameType,
          match.startedAt,
        );

        if (suspicious) {
          logger.warn('[PLAYER_FINISH] suspicious metrics clamped', {
            userId,
            matchId,
            gameType: match.gameType,
          });
        }

        // isFirst = true doar dacă niciun alt jucător REAL nu a terminat deja
        // (botii pot avea finishedAt setat de simulator, nu contează pentru bonus)
        const finishedRealPlayers = match.players.filter(
          (p: any) => p.finishedAt && p.user?.userType === 'REAL' && p.userId !== userId,
        );
        const isFirst = finishedRealPlayers.length === 0;

        const finalScore = gameRegistry.calculateFinalScoreForLevel(match.gameType, match.level, correctAnswers, mistakes, isFirst);

        pushGhostEvent(matchId, userId, 'finish', match.startedAt, {
          score: finalScore,
          correctAnswers,
          mistakes,
          wallHits: typeof metrics.wallHits === 'number' ? metrics.wallHits : undefined,
        });

        await prisma.matchPlayer.updateMany({
          where: { matchId, userId },
          data: {
            score: finalScore,
            correctAnswers,
            mistakes,
            finishedAt: new Date(),
            isFirstFinisher: isFirst,
          },
        });

        const updated = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: { include: { user: true } } },
        });

        io.to(`match:${matchId}`).emit(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, {
          userId,
          correctAnswers,
          mistakes,
          metrics,
          liveScore: finalScore,
          finished: true,
          players: updated?.players,
        });

        // All finished? — dacă toți jucătorii reali au terminat, încheiem meciul
        // imediat fără să așteptăm botii (SIMULATED/GHOST) care nu trimit PLAYER_FINISH
        const allFinished = updated?.players.every((p: any) => p.finishedAt);
        const allRealFinished = updated?.players
          .filter((p: any) => p.user?.userType === 'REAL')
          .every((p: any) => p.finishedAt);
        if (allFinished || allRealFinished) {
          clearTimeout(matchTimers[matchId]);
          await finalizeMatch(io, matchId, `match:${matchId}`);
        }
      } catch (err) {
        logger.error('PLAYER_FINISH error', { userId, err });
      }
    }
  );

  // ─── Emoji Reaction ─────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.SEND_REACTION, ({ matchId, emoji }: { matchId: string; emoji: string }) => {
    const ALLOWED = ['👍', '🔥', '😅', '😂', '💪', '🎉'];
    if (!ALLOWED.includes(emoji)) return;
    // Trimite reacția tuturor din cameră (inclusiv expeditorul, pentru confirmare)
    io.to(`match:${matchId}`).emit(SOCKET_EVENTS.REACTION_RECEIVED, { userId, emoji });
  });

  // ─── Leave Match (click inapoi / navigare explicita) ───────────────────────
  socket.on(SOCKET_EVENTS.LEAVE_MATCH, ({ matchId }: { matchId: string }) => {
    socketMatchMap.delete(socket.id);
    progressRateState.delete(socket.id);
    socket.leave(`match:${matchId}`);
    // Daca meciul e activ, playerul care pleaca forfeiaza
    handlePlayerLeft(io, userId, matchId).catch(() => {});
  });

  // ─── Disconnect (inchide browserul / pierde conexiunea) ──────────────────────
  socket.on('disconnect', () => {
    const matchId = socketMatchMap.get(socket.id);
    socketMatchMap.delete(socket.id);
    progressRateState.delete(socket.id);
    if (matchId) {
      handlePlayerLeft(io, userId, matchId).catch(() => {});
    }
  });
}

// ─── Forfeit: un jucator a parasit meciul activ ──────────────────────────────
async function handlePlayerLeft(io: SocketServer, userId: string, matchId: string) {
  if (!matchId) return;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: true } } },
  });

  if (!match) return;

  // ─── Caz special: userul a plecat inainte sa inceapa jocul (match in asteptare) ──
  if (match.status === 'waiting') {
    logger.info('Jucator a abandonat meciul in asteptare', { userId, matchId });
    const now = new Date();
    await prisma.matchPlayer.updateMany({
      where: { matchId, userId },
      data: { score: 0, finishedAt: now },
    });
    await prisma.match.update({
      where: { id: matchId },
      data: { status: 'abandoned', finishedAt: now },
    });
    return;
  }

  // Actionam doar daca meciul e activ sau in countdown
  if (match.status !== 'active' && match.status !== 'countdown') return;

  const room = `match:${matchId}`;
  logger.info('Jucator a parasit meciul activ', { userId, matchId, status: match.status });

  // Opreste countdown-ul daca era in curs
  if (countdownTimers[matchId]) {
    clearInterval(countdownTimers[matchId]);
    delete countdownTimers[matchId];
  }
  if (matchTimers[matchId]) {
    clearTimeout(matchTimers[matchId]);
    delete matchTimers[matchId];
  }
  countdownStarted.delete(matchId);

  // Marcheaza playerul care a plecat cu scor 0 si finishedAt acum
  const now = new Date();
  await prisma.matchPlayer.updateMany({
    where: { matchId, userId },
    data: { score: 0, finishedAt: now, correctAnswers: 0, mistakes: 0 },
  });

  // Marcheaza ceilalti jucatori ca terminati + bonus forfeit (per joc)
  const FORFEIT_BONUS = gameRegistry.getEffectiveRules(match.gameType, match.level)?.forfeitBonus ?? gameRegistry.getForfeitBonus(match.gameType);
  for (const p of match.players) {
    if (p.userId !== userId && !p.finishedAt) {
      await prisma.matchPlayer.updateMany({
        where: { matchId, userId: p.userId },
        data: { finishedAt: now, score: { increment: FORFEIT_BONUS } },
      });
    }
  }

  // Seteaza meciul ca activ inainte de finalizare (daca era in countdown)
  if (match.status === 'countdown') {
    await prisma.match.update({ where: { id: matchId }, data: { status: 'active', startedAt: now } });
  }

  // Notifica jucatorii ramasi
  io.to(room).emit(SOCKET_EVENTS.OPPONENT_LEFT, { userId });

  // Finalizeaza dupa o mica pauza (2s) ca frontend-ul sa primeasca notificarea
  setTimeout(() => {
    finalizeMatch(io, matchId, room, userId).catch(() => {});
  }, 2000);
}

// ─── Auto-finish when time runs out ──────────────────────────────────────────
async function autoFinishMatch(io: SocketServer, matchId: string, room: string) {
  countdownStarted.delete(matchId);

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  });
  if (!match || match.status !== 'active') return;

  // Marcheaza toti jucatorii care nu au terminat ca terminati (cu scorul curent)
  const now = new Date();
  for (const p of match.players) {
    if (!p.finishedAt) {
      await prisma.matchPlayer.updateMany({
        where: { matchId, userId: p.userId },
        data: { finishedAt: now },
      });
    }
  }

  await finalizeMatch(io, matchId, room);
}

function safeJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function movingAverage(current: number, next: number, samples: number): number {
  if (samples <= 0) return next;
  return (current * samples + next) / (samples + 1);
}

async function updatePlayerSkillProfileForMatch(params: {
  userId: string;
  gameType: string;
  totalPlayers: number;
  position: number;
  correctAnswers: number;
  mistakes: number;
  completionTimeSec: number;
}) {
  const { userId, gameType, totalPlayers, position, correctAnswers, mistakes, completionTimeSec } = params;

  const existingProfile = await prisma.playerSkillProfile.findUnique({ where: { userId } });

  const historicalMatches = await prisma.userGameStats.aggregate({
    where: { userId },
    _sum: { totalMatches: true, wins: true, losses: true },
  });

  const sampleCount = historicalMatches._sum.totalMatches ?? 0;
  const historicalWins = historicalMatches._sum.wins ?? 0;
  const historicalLosses = historicalMatches._sum.losses ?? 0;

  const attempts = Math.max(1, correctAnswers + mistakes);
  const currentMistakeRate = mistakes / attempts;
  const currentSuccessRate = correctAnswers / attempts;

  const rankSuccess = totalPlayers <= 1
    ? 1
    : Math.max(0, 1 - (position - 1) / Math.max(1, totalPlayers - 1));

  const preferred = new Set<string>(safeJsonArray(existingProfile?.preferredGameTypes));
  preferred.add(gameType);

  const updatedAverageCompletion = movingAverage(
    existingProfile?.averageCompletionTime ?? 0,
    completionTimeSec,
    sampleCount,
  );

  const updatedMistakeRate = movingAverage(
    existingProfile?.mistakeRate ?? 0,
    currentMistakeRate,
    sampleCount,
  );

  const updatedSuccessRate = movingAverage(
    existingProfile?.successRate ?? 0,
    currentSuccessRate,
    sampleCount,
  );

  const updatedHintUsageRate = existingProfile?.hintUsageRate ?? 0;
  const updatedCorrectionRate = existingProfile?.correctionRate ?? 0;
  const updatedPathEfficiency = movingAverage(
    existingProfile?.pathEfficiency ?? 0,
    rankSuccess,
    sampleCount,
  );

  const isWin = position === 1;
  const isLoss = position === totalPlayers;
  const totalWins = historicalWins + (isWin ? 1 : 0);
  const totalLosses = historicalLosses + (isLoss ? 1 : 0);
  const winLossRatio = totalWins / Math.max(1, totalLosses);

  await prisma.playerSkillProfile.upsert({
    where: { userId },
    update: {
      averageCompletionTime: Number(updatedAverageCompletion.toFixed(3)),
      mistakeRate: Number(updatedMistakeRate.toFixed(4)),
      successRate: Number(updatedSuccessRate.toFixed(4)),
      preferredGameTypes: JSON.stringify(Array.from(preferred)),
      winLossRatio: Number(winLossRatio.toFixed(4)),
      hintUsageRate: Number(updatedHintUsageRate.toFixed(4)),
      correctionRate: Number(updatedCorrectionRate.toFixed(4)),
      pathEfficiency: Number(updatedPathEfficiency.toFixed(4)),
    },
    create: {
      userId,
      averageCompletionTime: Number(completionTimeSec.toFixed(3)),
      mistakeRate: Number(currentMistakeRate.toFixed(4)),
      successRate: Number(currentSuccessRate.toFixed(4)),
      preferredGameTypes: JSON.stringify([gameType]),
      winLossRatio: Number((isWin ? 1 : 0).toFixed(4)),
      hintUsageRate: 0,
      correctionRate: 0,
      pathEfficiency: Number(rankSuccess.toFixed(4)),
    },
  });
}

// ─── Finalize: calculate ELO, XP, update DB, emit results ────────────────────
async function finalizeMatch(io: SocketServer, matchId: string, room: string, forfeitUserId?: string) {
  // Curăță orice timere active și tracking
  countdownStarted.delete(matchId);
  if (countdownTimers[matchId]) {
    clearInterval(countdownTimers[matchId]);
    delete countdownTimers[matchId];
  }
  if (matchTimers[matchId]) {
    clearTimeout(matchTimers[matchId]);
    delete matchTimers[matchId];
  }

  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: { include: { user: true } } },
    });
    if (!match) return;

    // Marchează botii (SIMULATED/GHOST) care nu au terminat — se întâmplă când
    // meciul e finalizat devreme de un jucător real ce-a ajuns la finish
    const now = new Date();
    for (const p of match.players) {
      if (!p.finishedAt && p.user?.userType !== 'REAL') {
        await prisma.matchPlayer.updateMany({
          where: { matchId, userId: p.userId },
          data: { finishedAt: now },
        });
      }
    }

    // Sort by score descending; forfeit player always last
    const sorted = [...match.players].sort((a, b) => {
      if (forfeitUserId) {
        if (a.userId === forfeitUserId) return 1;
        if (b.userId === forfeitUserId) return -1;
      }
      return b.score - a.score;
    });
    const totalPlayers = sorted.length;
    const allRatings = match.players.map((p: any) => p.user.rating);

    // Update each player's ELO, XP, stats
    for (let i = 0; i < sorted.length; i++) {
      const mp = sorted[i];
      const position = i + 1;
      const opponentRatings = (allRatings as number[]).filter((_: number, idx: number) => match.players[idx].userId !== mp.userId);
      const newElo = opponentRatings.length > 0
        ? systemConfigService.calculateELO(mp.user.rating, opponentRatings, position, totalPlayers)
        : mp.user.rating;
      const eloChange = newElo - mp.user.rating;
      const xpGained = systemConfigService.calculateXPGained(position, totalPlayers);

      await prisma.matchPlayer.updateMany({
        where: { matchId, userId: mp.userId },
        data: { position, eloChange, xpGained },
      });

      await prisma.user.update({
        where: { id: mp.userId },
        data: {
          rating: newElo,
          xp: { increment: xpGained },
          league: systemConfigService.ratingToLeague(newElo),
        },
      });

      // Upsert UserGameStats
      // Normalizăm gameType: 'maze' și 'labirinturi' sunt același joc, stocăm ca 'labirinturi'
      const statsGameType = match.gameType === 'maze' ? 'labirinturi' : match.gameType;
      const isWin = position === 1;
      const isLoss = position === totalPlayers;
      await prisma.userGameStats.upsert({
        where: { userId_gameType_level: { userId: mp.userId, gameType: statsGameType, level: match.level } },
        create: {
          userId: mp.userId,
          gameType: statsGameType,
          level: match.level,
          totalMatches: 1,
          wins: isWin ? 1 : 0,
          losses: isLoss ? 1 : 0,
          draws: !isWin && !isLoss ? 1 : 0,
          totalScore: mp.score,
          bestScore: mp.score,
          avgScore: mp.score,
          currentStreak: isWin ? 1 : 0,
          bestStreak: isWin ? 1 : 0,
          eloHistory: JSON.stringify([{ date: new Date().toISOString(), rating: newElo }]),
        },
        update: {
          totalMatches: { increment: 1 },
          wins: isWin ? { increment: 1 } : undefined,
          losses: isLoss ? { increment: 1 } : undefined,
          draws: !isWin && !isLoss ? { increment: 1 } : undefined,
          totalScore: { increment: mp.score },
          bestScore: mp.score > (await prisma.userGameStats.findUnique({
            where: { userId_gameType_level: { userId: mp.userId, gameType: statsGameType, level: match.level } },
          }).then((s: { bestScore: number } | null) => s?.bestScore ?? 0)) ? mp.score : undefined,
        },
      });

      if (mp.user.userType === 'REAL') {
        const completionTimeSec = match.startedAt && mp.finishedAt
          ? Math.max(0, Number(((new Date(mp.finishedAt).getTime() - new Date(match.startedAt).getTime()) / 1000).toFixed(2)))
          : 0;

        await updatePlayerSkillProfileForMatch({
          userId: mp.userId,
          gameType: match.gameType,
          totalPlayers,
          position,
          correctAnswers: mp.correctAnswers ?? 0,
          mistakes: mp.mistakes ?? 0,
          completionTimeSec,
        });

        // Evaluează challengele de bonus pentru jucătorul curent
        await evaluateChallengesForUser({
          userId: mp.userId,
          gameType: match.gameType,
          position,
          totalPlayers,
          score: mp.score,
        }).catch((err) => logger.warn('evaluateChallengesForUser failed', { err }));
      }
    }

    await prisma.match.update({ where: { id: matchId }, data: { status: 'finished', finishedAt: new Date() } });

    const final = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: { include: { user: true } } },
    });

    await captureGhostRuns(final);

    io.to(room).emit(SOCKET_EVENTS.MATCH_FINISHED, final);

    // ── ContestEngine hook (non-blocking, nu afectează meciul) ────────────────
    if (final) {
      const realFinished = final.players.filter(
        (p: { user: { userType: string }; finishedAt: Date | null; score: number }) =>
          p.user.userType === 'REAL' && p.finishedAt != null
      );
      for (const rp of realFinished) {
        const timeTaken = match.startedAt && rp.finishedAt
          ? Math.round((new Date(rp.finishedAt).getTime() - new Date(match.startedAt).getTime()) / 1000)
          : undefined;
        contestEngine
          .processMatchResult(matchId, match.gameType, rp.userId, rp.score, match.level ?? 1, timeTaken)
          .catch((err) => logger.warn('[ContestEngine] hook error', { matchId, userId: rp.userId, err: String(err) }));
      }
    }
  } catch (err) {
    logger.error('finalizeMatch error', { matchId, err });
  }
}
