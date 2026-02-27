import { Server as SocketServer, Socket } from 'socket.io';
import prisma from '../prisma';
import logger from '../logger';
import {
  SOCKET_EVENTS,
  calculateScore,
  calculateXPGained,
  calculateELO,
  ratingToLeague,
  GAME_RULES,
} from '@integrame/shared';

const countdownTimers: Record<string, ReturnType<typeof setInterval>> = {};
const matchTimers: Record<string, ReturnType<typeof setTimeout>> = {};
// Previne pornirea multiplă a countdown-ului pentru același meci
const countdownStarted: Set<string> = new Set();
// Tracker socket.id → matchId (pentru detectare disconnect)
const socketMatchMap: Map<string, string> = new Map();

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
        socket.emit(SOCKET_EVENTS.MATCH_START, { startedAt: match.startedAt });
        return;
      }

      if (match.status === 'countdown') {
        logger.info(`[JOIN_MATCH] COUNTDOWN → trimit MATCH_COUNTDOWN(3) user=${userId}`);
        socket.emit(SOCKET_EVENTS.MATCH_COUNTDOWN, { countdown: 3 });
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
          io.to(room).emit(SOCKET_EVENTS.MATCH_START, { startedAt: new Date() });
          logger.info(`[COUNTDOWN] MATCH_START emis room=${room}`);
          const rules = GAME_RULES[match.gameType] || GAME_RULES['integrame'];
          matchTimers[matchId] = setTimeout(() => autoFinishMatch(io, matchId, room), rules.timeLimit * 1000);
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
    async ({ matchId, correctAnswers, mistakes }: { matchId: string; correctAnswers: number; mistakes: number }) => {
      try {
        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: true },
        });
        if (!match || match.status !== 'active') return;

        const rules = GAME_RULES[match.gameType] || GAME_RULES['integrame'];
        const liveScore = calculateScore({
          correctAnswers,
          mistakes,
          isFirstFinisher: false,
          hasFinished: false,
          rules,
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
    async ({ matchId, correctAnswers, mistakes }: { matchId: string; correctAnswers: number; mistakes: number }) => {
      try {
        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: { include: { user: true } } },
        });
        if (!match || match.status !== 'active') return;

        const finishedPlayers = match.players.filter((p: any) => p.finishedAt);
        const isFirst = finishedPlayers.length === 0;

        const rules = GAME_RULES[match.gameType] || GAME_RULES['integrame'];
        const finalScore = calculateScore({
          correctAnswers,
          mistakes,
          isFirstFinisher: isFirst,
          hasFinished: true,
          rules,
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
          liveScore: finalScore,
          finished: true,
          players: updated?.players,
        });

        // All finished?
        const allFinished = updated?.players.every((p: any) => p.finishedAt);
        if (allFinished) {
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
    socket.leave(`match:${matchId}`);
    // Daca meciul e activ, playerul care pleaca forfeiaza
    handlePlayerLeft(io, userId, matchId).catch(() => {});
  });

  // ─── Disconnect (inchide browserul / pierde conexiunea) ──────────────────────
  socket.on('disconnect', () => {
    const matchId = socketMatchMap.get(socket.id);
    socketMatchMap.delete(socket.id);
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

  // Actionam doar daca meciul e activ sau in countdown
  if (!match || (match.status !== 'active' && match.status !== 'countdown')) return;

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

  // Marcheaza ceilalti jucatori ca terminati + bonus forfeit 10 pts
  const FORFEIT_BONUS = 10;
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
        ? calculateELO(mp.user.rating, opponentRatings, position, totalPlayers)
        : mp.user.rating;
      const eloChange = newElo - mp.user.rating;
      const xpGained = calculateXPGained(position, totalPlayers);

      await prisma.matchPlayer.updateMany({
        where: { matchId, userId: mp.userId },
        data: { position, eloChange, xpGained },
      });

      await prisma.user.update({
        where: { id: mp.userId },
        data: {
          rating: newElo,
          xp: { increment: xpGained },
          league: ratingToLeague(newElo),
        },
      });

      // Upsert UserGameStats
      const isWin = position === 1;
      const isLoss = position === totalPlayers;
      await prisma.userGameStats.upsert({
        where: { userId_gameType_level: { userId: mp.userId, gameType: match.gameType, level: match.level } },
        create: {
          userId: mp.userId,
          gameType: match.gameType,
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
            where: { userId_gameType_level: { userId: mp.userId, gameType: match.gameType, level: match.level } },
          }).then((s: { bestScore: number } | null) => s?.bestScore ?? 0)) ? mp.score : undefined,
        },
      });
    }

    await prisma.match.update({ where: { id: matchId }, data: { status: 'finished', finishedAt: new Date() } });

    const final = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: { include: { user: true } } },
    });

    io.to(room).emit(SOCKET_EVENTS.MATCH_FINISHED, final);
  } catch (err) {
    logger.error('finalizeMatch error', { matchId, err });
  }
}
