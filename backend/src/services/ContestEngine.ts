/**
 * ContestEngine
 * ─────────────
 * Motor central pentru sistemul de concursuri/turnee.
 *
 * Principii arhitecturale:
 *  - Jocurile NU știu despre concursuri. Hook-ul din finalizeMatch e non-blocking.
 *  - Suportă multiple concursuri simultane (findMany, nu findFirst).
 *  - Runde dinamice: fiecare rundă are gameType, minLevel, matchesCount (top N).
 *  - Best N scores per (userId × rundă) — configurat per rundă.
 *  - Tranziții automate de status via interval de 30s.
 *
 * Events socket emise:
 *  contest_status_change      → { contestId, status }
 *  contest_leaderboard_update → { contestId, leaderboard }
 *  contest_players_update     → { contestId, onlinePlayers: userId[] }
 */

import { PrismaClient } from '@prisma/client';
import { Server as SocketIO } from 'socket.io';
import logger from '../logger';

export interface RoundEntry {
  roundId: string;
  order: number;
  label: string;
  gameType: string;
  minLevel: number;
  matchesCount: number;
  score: number; // suma celor mai bune matchesCount meciuri
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalScore: number;
  rounds: RoundEntry[];   // scor per rundă
  matchesPlayed: number;
  joinedAt: string;
}

export interface ContestStats {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: string;
  status: string;
  startAt: string;
  endAt: string;
  maxPlayers: number | null;
  createdBy: string;
  createdAt: string;
  registeredCount: number;
  onlineCount: number;
  rounds: Array<{ id: string; order: number; label: string; gameType: string; minLevel: number; matchesCount: number }>;
  leaderboard: LeaderboardEntry[];
}

class ContestEngine {
  private prisma!: PrismaClient;
  private io!: SocketIO;
  private initialized = false;
  private transitionInterval: ReturnType<typeof setInterval> | null = null;

  // userId[] per contestId — în memorie (reset la restart server)
  private onlinePlayers: Map<string, Set<string>> = new Map();

  start(prisma: PrismaClient, io: SocketIO) {
    this.prisma = prisma;
    this.io = io;
    this.initialized = true;

    // Tranziții automate de status la fiecare 30 secunde
    this.transitionInterval = setInterval(() => {
      this.transitionStatuses().catch(err =>
        logger.warn('[ContestEngine] transitionStatuses error', { err: String(err) })
      );
    }, 30_000);

    // Rulăm imediat la startup să preia concursurile deja expirate/active
    this.transitionStatuses().catch(err =>
      logger.warn('[ContestEngine] initial transitionStatuses error', { err: String(err) })
    );

    logger.info('[ContestEngine] pornit ✅');
  }

  stop() {
    if (this.transitionInterval) {
      clearInterval(this.transitionInterval);
      this.transitionInterval = null;
    }
  }

  // ─── Tranziții automate de status ────────────────────────────────────────────

  private async transitionStatuses() {
    if (!this.initialized) return;
    const now = new Date();

    // waiting → live (sau cancelled dacă 0 jucători după enroll boți)
    const toActivate = await this.prisma.contest.findMany({
      where: { status: 'waiting', startAt: { lte: now } },
      select: { id: true, name: true, botsCount: true, maxPlayers: true, _count: { select: { players: true } } },
    });
    for (const c of toActivate) {
      // Auto-înregistrare boți SIMULATED dacă botsCount > 0
      if (c.botsCount > 0) {
        await this.enrollBots(c.id, c.botsCount, c.maxPlayers, c._count.players);
      }

      // Recalculăm numărul de jucători după enroll boți
      const playerCount = await this.prisma.contestPlayer.count({ where: { contestId: c.id } });

      if (playerCount === 0) {
        await this.prisma.contest.update({ where: { id: c.id }, data: { status: 'cancelled' } });
        this.io.to(`contest:${c.id}`).emit('contest_status_change', { contestId: c.id, status: 'cancelled' });
        logger.info(`[ContestEngine] Contest "${c.name}" → CANCELLED (0 jucători)`);
      } else {
        await this.prisma.contest.update({ where: { id: c.id }, data: { status: 'live' } });
        this.io.to(`contest:${c.id}`).emit('contest_status_change', { contestId: c.id, status: 'live' });
        logger.info(`[ContestEngine] Contest "${c.name}" → LIVE (${playerCount} jucători, din care boți: ${c.botsCount})`);
      }
    }

    // live → ended
    const toEnd = await this.prisma.contest.findMany({
      where: { status: 'live', endAt: { lte: now } },
      select: { id: true, name: true },
    });
    for (const c of toEnd) {
      await this.prisma.contest.update({ where: { id: c.id }, data: { status: 'ended' } });
      this.io.to(`contest:${c.id}`).emit('contest_status_change', { contestId: c.id, status: 'ended' });
      // Trimitem leaderboard final
      const lb = await this.getLeaderboard(c.id);
      this.io.to(`contest:${c.id}`).emit('contest_leaderboard_update', { contestId: c.id, leaderboard: lb });
      logger.info(`[ContestEngine] Contest "${c.name}" → ENDED`);
    }
  }

  // ─── Auto-înregistrare boți SIMULATED ────────────────────────────────────────

  private async enrollBots(contestId: string, botsCount: number, maxPlayers: number | null, currentPlayers: number) {
    const slots = maxPlayers !== null ? Math.min(botsCount, maxPlayers - currentPlayers) : botsCount;
    if (slots <= 0) return;

    // Luăm boți care nu sunt deja înregistrați la acest concurs
    const alreadyIn = await this.prisma.contestPlayer.findMany({
      where: { contestId },
      select: { userId: true },
    });
    const alreadyInIds = alreadyIn.map(p => p.userId);

    const bots = await this.prisma.user.findMany({
      where: { userType: 'SIMULATED', id: { notIn: alreadyInIds } },
      select: { id: true },
      take: slots,
      orderBy: { createdAt: 'desc' },
    });

    if (bots.length === 0) return;

    await this.prisma.contestPlayer.createMany({
      data: bots.map(b => ({ contestId, userId: b.id })),
    });

    logger.info(`[ContestEngine] Auto-înregistrați ${bots.length} boți la concurs ${contestId}`);
  }

  // ─── Hook din finalizeMatch (apelat pentru fiecare jucător REAL) ──────────────

  async processMatchResult(
    matchId: string,
    gameType: string,
    userId: string,
    score: number,
    level: number,
    timeTaken?: number
  ) {
    if (!this.initialized) return;

    try {
      // Găsim toate concursurile LIVE în care userul e înrolat și există
      // cel puțin o rundă cu gameType-ul potrivit
      const activeContests = await this.prisma.contest.findMany({
        where: {
          status: 'live',
          players: { some: { userId } },
          rounds: { some: { gameType } },
        },
        include: {
          rounds: {
            where: { gameType },
            orderBy: { order: 'asc' },
          },
        },
      });

      if (activeContests.length === 0) return;

      for (const contest of activeContests) {
        // Filtrăm rundele unde nivelul meciului coincide exact cu nivelul rundei
        const eligibleRounds = contest.rounds.filter(r => level === r.minLevel);
        if (eligibleRounds.length === 0) continue;

        for (const round of eligibleRounds) {
          await this.prisma.contestScore.create({
            data: {
              contestId: contest.id,
              roundId: round.id,
              userId,
              gameType,
              matchId,
              score,
              level,
              timeTaken: timeTaken ?? null,
            },
          });
        }

        // Emitem leaderboard actualizat pe room-ul concursului
        const leaderboard = await this.getLeaderboard(contest.id);
        this.io.to(`contest:${contest.id}`).emit('contest_leaderboard_update', {
          contestId: contest.id,
          leaderboard,
        });
      }
    } catch (err) {
      // Eroarea nu afectează meciul — doar logăm
      logger.warn('[ContestEngine] processMatchResult error', { matchId, userId, err: String(err) });
    }
  }

  // ─── Leaderboard agregat ──────────────────────────────────────────────────────

  async getLeaderboard(contestId: string): Promise<LeaderboardEntry[]> {
    const [players, rounds, scores] = await Promise.all([
      this.prisma.contestPlayer.findMany({
        where: { contestId },
        select: { userId: true, joinedAt: true },
      }),
      this.prisma.contestRound.findMany({
        where: { contestId },
        orderBy: { order: 'asc' },
      }),
      this.prisma.contestScore.findMany({
        where: { contestId },
        select: { userId: true, roundId: true, score: true },
        orderBy: { score: 'desc' },
      }),
    ]);

    if (players.length === 0) return [];

    const userIds = players.map(p => p.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatarUrl: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Grupăm scorurile: roundId → userId → [scores asc]
    const scoresByRoundUser: Record<string, Record<string, number[]>> = {};
    for (const s of scores) {
      if (!scoresByRoundUser[s.roundId]) scoresByRoundUser[s.roundId] = {};
      if (!scoresByRoundUser[s.roundId][s.userId]) scoresByRoundUser[s.roundId][s.userId] = [];
      scoresByRoundUser[s.roundId][s.userId].push(s.score);
    }

    const entries: LeaderboardEntry[] = players.map(p => {
      const user = userMap.get(p.userId);
      const roundEntries: RoundEntry[] = rounds.map(r => {
        const userRoundScores = (scoresByRoundUser[r.id]?.[p.userId] ?? [])
          .sort((a, b) => b - a) // descrescător
          .slice(0, r.matchesCount); // cele mai bune N
        const roundScore = userRoundScores.reduce((sum, s) => sum + s, 0);
        return {
          roundId: r.id,
          order: r.order,
          label: r.label,
          gameType: r.gameType,
          minLevel: r.minLevel,
          matchesCount: r.matchesCount,
          score: roundScore,
        };
      });

      const totalScore = roundEntries.reduce((sum, r) => sum + r.score, 0);
      const totalMatches = scores.filter(s => s.userId === p.userId).length;

      return {
        rank: 0,
        userId: p.userId,
        username: user?.username ?? 'Unknown',
        avatarUrl: user?.avatarUrl ?? null,
        totalScore,
        rounds: roundEntries,
        matchesPlayed: totalMatches,
        joinedAt: p.joinedAt.toISOString(),
      };
    });

    entries.sort((a, b) => b.totalScore - a.totalScore);

    // Rankuri (egalitate → același rank)
    let rank = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].totalScore === entries[i - 1].totalScore) {
        entries[i].rank = entries[i - 1].rank;
      } else {
        entries[i].rank = rank;
      }
      rank++;
    }

    return entries;
  }

  // ─── Online players tracking ──────────────────────────────────────────────────

  markOnline(contestId: string, userId: string) {
    if (!this.onlinePlayers.has(contestId)) {
      this.onlinePlayers.set(contestId, new Set());
    }
    this.onlinePlayers.get(contestId)!.add(userId);
    this.emitOnlinePlayers(contestId);
  }

  markOffline(contestId: string, userId: string) {
    this.onlinePlayers.get(contestId)?.delete(userId);
    this.emitOnlinePlayers(contestId);
  }

  markOfflineFromAll(userId: string) {
    for (const [contestId, set] of this.onlinePlayers) {
      if (set.has(userId)) {
        set.delete(userId);
        this.emitOnlinePlayers(contestId);
      }
    }
  }

  getOnlinePlayers(contestId: string): string[] {
    return Array.from(this.onlinePlayers.get(contestId) ?? []);
  }

  private emitOnlinePlayers(contestId: string) {
    this.io.to(`contest:${contestId}`).emit('contest_players_update', {
      contestId,
      onlinePlayers: this.getOnlinePlayers(contestId),
    });
  }

  // ─── Stats complete pentru admin ─────────────────────────────────────────────

  async getContestStats(contestId: string): Promise<ContestStats | null> {
    const contest = await this.prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        rounds: { orderBy: { order: 'asc' } },
        _count: { select: { players: true } },
      },
    });
    if (!contest) return null;

    const leaderboard = await this.getLeaderboard(contestId);
    const onlineCount = this.getOnlinePlayers(contestId).length;

    return {
      id: contest.id,
      name: contest.name,
      slug: contest.slug,
      description: contest.description,
      type: contest.type,
      status: contest.status,
      startAt: contest.startAt.toISOString(),
      endAt: contest.endAt.toISOString(),
      maxPlayers: contest.maxPlayers,
      createdBy: contest.createdBy,
      createdAt: contest.createdAt.toISOString(),
      registeredCount: contest._count.players,
      onlineCount,
      rounds: contest.rounds.map(r => ({
        id: r.id,
        order: r.order,
        label: r.label,
        gameType: r.gameType,
        minLevel: r.minLevel,
        matchesCount: r.matchesCount,
      })),
      leaderboard,
    };
  }

  // ─── Force start/end (admin) ──────────────────────────────────────────────────

  async forceStart(contestId: string) {
    const contest = await this.prisma.contest.update({
      where: { id: contestId },
      data: { status: 'live' },
      select: { id: true, name: true },
    });
    this.io.to(`contest:${contest.id}`).emit('contest_status_change', { contestId: contest.id, status: 'live' });
    logger.info(`[ContestEngine] Force start: "${contest.name}"`);
  }

  async forceEnd(contestId: string) {
    const contest = await this.prisma.contest.update({
      where: { id: contestId },
      data: { status: 'ended' },
      select: { id: true, name: true },
    });
    this.io.to(`contest:${contest.id}`).emit('contest_status_change', { contestId: contest.id, status: 'ended' });
    const lb = await this.getLeaderboard(contest.id);
    this.io.to(`contest:${contest.id}`).emit('contest_leaderboard_update', { contestId: contest.id, leaderboard: lb });
    logger.info(`[ContestEngine] Force end: "${contest.name}"`);
  }
}

// Singleton exportat
export const contestEngine = new ContestEngine();
