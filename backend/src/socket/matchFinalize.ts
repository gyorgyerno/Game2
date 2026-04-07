// ─── Finalizare meci: ELO, XP, stats, ghost runs, contest hook ───────────────
import { Server as SocketServer } from 'socket.io';
import prisma from '../prisma';
import logger from '../logger';
import { SOCKET_EVENTS } from '@integrame/shared';
import { systemConfigService } from '../services/SystemConfigService';
import { evaluateChallengesForUser } from '../services/BonusChallengeService';
import { contestEngine } from '../services/ContestEngine';
import { countdownTimers, matchTimers, countdownStarted } from './matchState';
import { scheduleAdminStatsEmit } from './index';
import { captureGhostRuns } from './ghostRuns';
import { updatePlayerSkillProfileForMatch } from './skillProfile';

export async function autoFinishMatch(io: SocketServer, matchId: string, room: string): Promise<void> {
  countdownStarted.delete(matchId);

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  });
  if (!match || match.status !== 'active') return;

  // Marchează toți jucătorii care nu au terminat (cu scorul curent)
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

export async function finalizeMatch(
  io: SocketServer,
  matchId: string,
  room: string,
  forfeitUserId?: string,
): Promise<void> {
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

    // Marchează botii (SIMULATED/GHOST) care nu au terminat
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

    for (let i = 0; i < sorted.length; i++) {
      const mp = sorted[i];
      const position = i + 1;
      const opponentRatings = (allRatings as number[]).filter(
        (_: number, idx: number) => match.players[idx].userId !== mp.userId,
      );
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

      // Upsert UserGameRating (ELO/XP/ligă per joc, nu per nivel)
      // Normalizăm gameType: 'maze' și 'labirinturi' sunt același joc, stocăm ca 'labirinturi'
      const statsGameType = match.gameType === 'maze' ? 'labirinturi' : match.gameType;
      {
        const existingGameRating = await prisma.userGameRating.findUnique({
          where: { userId_gameType: { userId: mp.userId, gameType: statsGameType } },
        });
        const currentGameRating = existingGameRating?.rating ?? 1000;
        const newGameElo = opponentRatings.length > 0
          ? systemConfigService.calculateELO(currentGameRating, opponentRatings, position, totalPlayers)
          : currentGameRating;
        await prisma.userGameRating.upsert({
          where: { userId_gameType: { userId: mp.userId, gameType: statsGameType } },
          create: {
            userId: mp.userId,
            gameType: statsGameType,
            rating: newGameElo,
            xp: xpGained,
            league: systemConfigService.ratingToLeague(newGameElo),
          },
          update: {
            rating: newGameElo,
            xp: { increment: xpGained },
            league: systemConfigService.ratingToLeague(newGameElo),
          },
        });
      }

      // Upsert UserGameStats
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

        await evaluateChallengesForUser({
          userId: mp.userId,
          gameType: match.gameType,
          position,
          totalPlayers,
          score: mp.score,
        }).catch((err) => logger.warn('evaluateChallengesForUser failed', { err }));
      }
    }

    await prisma.match.update({
      where: { id: matchId },
      data: { status: forfeitUserId ? 'abandoned' : 'finished', finishedAt: new Date() },
    });

    const final = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: { include: { user: true } } },
    });

    await captureGhostRuns(final);

    io.to(room).emit(SOCKET_EVENTS.MATCH_FINISHED, final);
    scheduleAdminStatsEmit();

    // ── ContestEngine hook (non-blocking, nu afectează meciul) ────────────────
    if (final) {
      const realFinished = final.players.filter(
        (p: { user: { userType: string }; finishedAt: Date | null; score: number }) =>
          p.user.userType === 'REAL' && p.finishedAt != null,
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
