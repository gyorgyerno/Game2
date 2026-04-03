// ─── Abandon penalty + gestiune jucător care a plecat din meci ───────────────
import { Server as SocketServer } from 'socket.io';
import prisma from '../prisma';
import logger from '../logger';
import { SOCKET_EVENTS } from '@integrame/shared';
import { systemConfigService } from '../services/SystemConfigService';
import { gameRegistry } from '../games/GameRegistry';
import { countdownTimers, matchTimers, countdownStarted } from './matchState';
import { normalizeGameType } from './inputSanitizer';
import { finalizeMatch } from './matchFinalize';

// ─── Penalizare abandon: deduce XP + auto-block dacă prea multe abandon-uri ──
export async function applyAbandonPenalty(
  userId: string,
  gameType: string,
  level: number,
  isAI: boolean,
): Promise<void> {
  const abandonCfg = systemConfigService.getAbandon();
  const normalizedType = normalizeGameType(gameType);
  const normalizedEnabled = (abandonCfg.enabledGameTypes ?? []).map(normalizeGameType);
  if (!normalizedEnabled.includes(normalizedType)) return;

  // Nu penalizăm userii SIMULATED / GHOST
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { userType: true, xp: true } });
  if (!user || user.userType !== 'REAL') return;

  // Găsește penalizarea pentru nivelul curent (fallback la ultimul nivel configurat)
  const penalties = [...abandonCfg.penaltiesPerLevel].sort((a, b) => a.level - b.level);
  const penaltyRow = penalties.find((p) => p.level === level) ?? penalties[penalties.length - 1];

  if (penaltyRow) {
    const xpDelta = isAI ? penaltyRow.xpPenaltySolo : penaltyRow.xpPenaltyMulti;
    if (xpDelta !== 0) {
      const newXp = Math.max(0, user.xp + xpDelta);
      await prisma.user.update({ where: { id: userId }, data: { xp: newXp } });
      logger.info('Abandon XP penalty applied', { userId, level, isAI, xpDelta, newXp });
    }
  }

  // Auto-block: numără abandon-urile din ultima lună
  if (abandonCfg.autoBlockEnabled && abandonCfg.autoBlockThreshold > 0) {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const enabledGameTypes = (abandonCfg.enabledGameTypes ?? []).map(normalizeGameType);
    if (enabledGameTypes.length === 0) return;

    const abandonCount = await prisma.match.count({
      where: {
        status: 'abandoned',
        gameType: { in: enabledGameTypes },
        finishedAt: { gte: monthAgo },
        players: { some: { userId } },
      },
    });
    if (abandonCount >= abandonCfg.autoBlockThreshold) {
      await prisma.user.update({ where: { id: userId }, data: { isBanned: true } });
      logger.warn('User auto-blocat dupa abandon excesiv', {
        userId,
        abandonCount,
        threshold: abandonCfg.autoBlockThreshold,
        enabledGameTypes,
      });
    }
  }
}

// ─── Forfeit: un jucator a parasit meciul activ ──────────────────────────────
// explicit=true → LEAVE_MATCH (navigare voluntara): procesam si lobby-uri waiting
// explicit=false → disconnect (poate fi tranzitoriu): ignoram waiting, botii continua
export async function handlePlayerLeft(
  io: SocketServer,
  userId: string,
  matchId: string,
  explicit = false,
): Promise<void> {
  if (!matchId) return;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: true } } },
  });

  if (!match) return;

  // ─── Caz special: userul a plecat inainte sa inceapa jocul (match in asteptare) ──
  if (match.status === 'waiting') {
    if (!explicit) {
      // Disconnect tranzitoriu — nu atingem match-ul; userul se poate reconecta
      logger.info('Disconnect tranzitoriu in lobby waiting, ignorat', { userId, matchId });
      return;
    }

    logger.info('Jucator a iesit explicit din lobby-ul in asteptare', { userId, matchId });

    await prisma.matchPlayer.deleteMany({ where: { matchId, userId } });

    // Daca n-au ramas jucatori REALI, stergem tot match-ul (botii nu joaca singuri)
    const remainingRealPlayers = await prisma.matchPlayer.count({
      where: { matchId, user: { userType: 'REAL' } },
    });
    if (remainingRealPlayers === 0) {
      await prisma.match.delete({ where: { id: matchId } }).catch(() => {});
      logger.info('Lobby waiting sters (fara jucatori reali)', { matchId });
    } else {
      const updated = await prisma.match.findUnique({
        where: { id: matchId },
        include: { players: { include: { user: true } } },
      });
      if (updated) {
        io.to(`match:${matchId}`).emit(SOCKET_EVENTS.MATCH_STATE, updated);
      }
    }
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

  // Aplică penalizare XP + verifică auto-block
  await applyAbandonPenalty(userId, match.gameType, match.level, match.isAI).catch((err) =>
    logger.warn('applyAbandonPenalty failed', { err, userId, matchId }),
  );

  // Marcheaza ceilalti jucatori ca terminati + bonus forfeit (per joc)
  const FORFEIT_BONUS =
    gameRegistry.getEffectiveRules(match.gameType, match.level)?.forfeitBonus ??
    gameRegistry.getForfeitBonus(match.gameType);
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
