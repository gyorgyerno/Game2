import { Server as SocketServer, Socket } from 'socket.io';
import prisma from '../prisma';
import logger from '../logger';
import { SOCKET_EVENTS } from '@integrame/shared';
import { gameRegistry } from '../games/GameRegistry';
import { startBotGameplaySimulation } from '../services/simulatedPlayers/BotGameplaySimulator';
import {
  countdownTimers,
  matchTimers,
  countdownStarted,
  socketMatchMap,
  reconnectGraceTimers,
  RECONNECT_GRACE_MS,
  isProgressRateLimited,
  cleanupSocketState,
} from './matchState';
import {
  LegacyProgressPayload,
  GenericProgressPayload,
  isMazeGame,
  mazeSeedFromMatchId,
  normalizeScoreInput,
} from './inputSanitizer';
import { pushGhostEvent } from './ghostRuns';
import { finalizeMatch, autoFinishMatch } from './matchFinalize';
import { handlePlayerLeft } from './matchAbandon';

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
        // Anulează grace period dacă userul s-a reconectat după un disconnect/refresh
        const graceKey = `${userId}_${matchId}`;
        const pending = reconnectGraceTimers.get(graceKey);
        if (pending) {
          clearTimeout(pending);
          reconnectGraceTimers.delete(graceKey);
          logger.info(`[JOIN_MATCH] Reconectare în grace period — abandon anulat user=${userId} matchId=${matchId}`);
        }
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

        io.to(`match:${matchId}`).emit(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, {
          userId,
          correctAnswers,
          mistakes,
          metrics,
          liveScore,
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

        // Emitem delta imediat — nu mai așteptăm DB read pentru broadcast
        io.to(`match:${matchId}`).emit(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, {
          userId,
          correctAnswers,
          mistakes,
          metrics,
          liveScore: finalScore,
          finished: true,
        });

        // All finished? — dacă toți jucătorii reali au terminat, încheiem meciul
        // imediat fără să așteptăm botii (SIMULATED/GHOST) care nu trimit PLAYER_FINISH
        const updated = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: { include: { user: true } } },
        });

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
    cleanupSocketState(socket.id);
    socket.leave(`match:${matchId}`);
    // Navigare explicita: procesam si matching-urile in asteptare
    handlePlayerLeft(io, userId, matchId, true).catch(() => {});
  });

  // ─── Disconnect (inchide browserul / pierde conexiunea) ──────────────────────
  socket.on('disconnect', () => {
    const matchId = socketMatchMap.get(socket.id);
    cleanupSocketState(socket.id);
    if (!matchId) return;

    // Verifică rapid statusul meciului: dacă e activ, acordă grace period de 12s
    // pentru reconectare (refresh, reconectare rețea) înainte de a trata ca abandon
    prisma.match.findUnique({ where: { id: matchId }, select: { status: true } })
      .then((m) => {
        if (m?.status === 'active' || m?.status === 'countdown') {
          const graceKey = `${userId}_${matchId}`;
          // Evită duplicate grace timers (poate fi un al doilea socket)
          if (reconnectGraceTimers.has(graceKey)) return;
          logger.info(`[DISCONNECT] Grace period ${RECONNECT_GRACE_MS}ms pentru user=${userId} matchId=${matchId}`);
          const t = setTimeout(() => {
            reconnectGraceTimers.delete(graceKey);
            logger.info(`[DISCONNECT] Grace period expirat — abandon user=${userId} matchId=${matchId}`);
            handlePlayerLeft(io, userId, matchId, false).catch(() => {});
          }, RECONNECT_GRACE_MS);
          reconnectGraceTimers.set(graceKey, t);
        } else {
          // Meci în waiting sau altă stare — comportamentul existent
          handlePlayerLeft(io, userId, matchId, false).catch(() => {});
        }
      })
      .catch(() => {
        handlePlayerLeft(io, userId, matchId, false).catch(() => {});
      });
  });
}

