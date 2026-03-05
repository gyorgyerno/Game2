import prisma from '../../prisma';
import logger from '../../logger';
import { config } from '../../config';
import { behaviorEngine } from './BehaviorEngine';

type ScheduleFillParams = {
  matchId: string;
  maxPlayers: number;
};

type OrchestratorHealth = {
  scheduledMatches: number;
  totalScheduled: number;
  totalJoined: number;
  totalSkipped: number;
  lastSkipReason?: string;
  lastActionAt?: string;
  lastDifficultyMode?: string;
};

type DifficultyTuning = {
  mode: 'assist' | 'balanced' | 'challenge';
  targetSkillLevel: number;
  minSkillLevel: number;
  maxSkillLevel: number;
};

class SimulatedMatchOrchestrator {
  private scheduledMatches = new Set<string>();
  private totalScheduled = 0;
  private totalJoined = 0;
  private totalSkipped = 0;
  private lastSkipReason?: string;
  private lastActionAt?: Date;
  private lastDifficultyMode?: string;

  getHealthSnapshot(): OrchestratorHealth {
    return {
      scheduledMatches: this.scheduledMatches.size,
      totalScheduled: this.totalScheduled,
      totalJoined: this.totalJoined,
      totalSkipped: this.totalSkipped,
      lastSkipReason: this.lastSkipReason,
      lastActionAt: this.lastActionAt?.toISOString(),
      lastDifficultyMode: this.lastDifficultyMode,
    };
  }

  private registerSkip(reason: string, context: Record<string, unknown>): void {
    this.totalSkipped += 1;
    this.lastSkipReason = reason;
    this.lastActionAt = new Date();
    logger.info('[SimulatedMatchOrchestrator] skip', { reason, ...context });
  }

  private isFillEnabled(): boolean {
    return config.features.simPlayersEnabled || config.features.ghostPlayersEnabled;
  }

  private resolveDifficultyTuning(realPlayers: Array<{ user: { skillProfile: { winLossRatio: number } | null } }>): DifficultyTuning {
    const ratios = realPlayers
      .map((player) => player.user.skillProfile?.winLossRatio)
      .filter((ratio): ratio is number => typeof ratio === 'number' && Number.isFinite(ratio));

    if (ratios.length === 0) {
      this.lastDifficultyMode = 'balanced';
      return {
        mode: 'balanced',
        targetSkillLevel: 5,
        minSkillLevel: 3,
        maxSkillLevel: 7,
      };
    }

    const averageRatio = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;

    if (averageRatio < 0.85) {
      this.lastDifficultyMode = 'assist';
      return {
        mode: 'assist',
        targetSkillLevel: 4,
        minSkillLevel: 2,
        maxSkillLevel: 6,
      };
    }

    if (averageRatio > 1.25) {
      this.lastDifficultyMode = 'challenge';
      return {
        mode: 'challenge',
        targetSkillLevel: 7,
        minSkillLevel: 5,
        maxSkillLevel: 9,
      };
    }

    this.lastDifficultyMode = 'balanced';
    return {
      mode: 'balanced',
      targetSkillLevel: 5,
      minSkillLevel: 3,
      maxSkillLevel: 7,
    };
  }

  private async resolveGhostCandidate(match: { gameType: string; level: number; id: string }, currentPlayerIds: string[]) {
    if (!config.features.ghostPlayersEnabled) return null;

    const ghostRun = await prisma.ghostRun.findFirst({
      where: {
        gameType: match.gameType,
        difficulty: match.level,
        playerId: { notIn: currentPlayerIds.length ? currentPlayerIds : ['__none__'] },
      },
      include: {
        player: { select: { id: true, username: true, rating: true, xp: true, league: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!ghostRun || !ghostRun.player) return null;

    const usernameSuffix = ghostRun.player.id.replace(/-/g, '').slice(0, 6);
    const ghostEmail = `ghost.${ghostRun.player.id}@integrame.local`;
    const ghostUsername = `Ghost_${ghostRun.player.username}_${usernameSuffix}`.slice(0, 40);

    const ghostUser = await prisma.user.upsert({
      where: { email: ghostEmail },
      update: {
        userType: 'GHOST',
        username: ghostUsername,
        rating: ghostRun.player.rating,
        xp: ghostRun.player.xp,
        league: ghostRun.player.league,
      },
      create: {
        email: ghostEmail,
        username: ghostUsername,
        userType: 'GHOST',
        rating: ghostRun.player.rating,
        xp: ghostRun.player.xp,
        league: ghostRun.player.league,
      },
    });

    return {
      userId: ghostUser.id,
      joinType: 'GHOST' as const,
      delayProfile: null,
    };
  }

  private async resolveSimulatedCandidate(currentPlayerIds: string[], gameType: string, tuning: DifficultyTuning) {
    if (!config.features.simPlayersEnabled) return null;

    const candidates = await prisma.user.findMany({
      where: {
        userType: 'SIMULATED',
        aiProfile: {
          is: {
            enabled: true,
            skillLevel: {
              gte: tuning.minSkillLevel,
              lte: tuning.maxSkillLevel,
            },
          },
        },
        id: { notIn: currentPlayerIds.length > 0 ? currentPlayerIds : ['__none__'] },
      },
      include: { aiProfile: true },
      take: 30,
      orderBy: { createdAt: 'asc' },
    });

    const fallbackCandidates = candidates.length > 0
      ? candidates
      : await prisma.user.findMany({
          where: {
            userType: 'SIMULATED',
            aiProfile: { is: { enabled: true } },
            id: { notIn: currentPlayerIds.length > 0 ? currentPlayerIds : ['__none__'] },
          },
          include: { aiProfile: true },
          take: 30,
          orderBy: { createdAt: 'asc' },
        });

    const candidate = [...fallbackCandidates]
      .sort((left, right) => {
        const leftDistance = Math.abs((left.aiProfile?.skillLevel ?? 5) - tuning.targetSkillLevel);
        const rightDistance = Math.abs((right.aiProfile?.skillLevel ?? 5) - tuning.targetSkillLevel);

        if (leftDistance !== rightDistance) return leftDistance - rightDistance;

        const leftPrefersGame = left.aiProfile?.preferredGames?.includes(gameType) ? 1 : 0;
        const rightPrefersGame = right.aiProfile?.preferredGames?.includes(gameType) ? 1 : 0;
        return rightPrefersGame - leftPrefersGame;
      })
      .at(0);

    if (!candidate) return null;

    return {
      userId: candidate.id,
      joinType: 'SIMULATED' as const,
      delayProfile: candidate.aiProfile,
    };
  }

  scheduleFill(params: ScheduleFillParams): void {
    if (!this.isFillEnabled()) {
      this.registerSkip('feature_flags_off', { matchId: params.matchId });
      return;
    }
    if (params.maxPlayers <= 1) {
      this.registerSkip('invalid_max_players', { matchId: params.matchId, maxPlayers: params.maxPlayers });
      return;
    }
    if (this.scheduledMatches.has(params.matchId)) {
      this.registerSkip('already_scheduled', { matchId: params.matchId });
      return;
    }

    this.scheduledMatches.add(params.matchId);
    this.totalScheduled += 1;
    this.lastActionAt = new Date();
    const delayMs = behaviorEngine.resolveJoinDelayMs();

    setTimeout(() => {
      this.tryFillOneSlot(params).catch((error) => {
        logger.error('[SimulatedMatchOrchestrator] fill failed', {
          matchId: params.matchId,
          error,
        });
      });
    }, delayMs);
  }

  private async tryFillOneSlot(params: ScheduleFillParams): Promise<void> {
    try {
      const botConfig = await prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!botConfig || !botConfig.enabled) {
        this.registerSkip('bot_config_disabled', { matchId: params.matchId });
        return;
      }

      const nonRealPlayersInWaitingMatches = await prisma.matchPlayer.count({
        where: {
          user: { userType: { in: ['SIMULATED', 'GHOST'] } },
          match: { status: 'waiting' },
        },
      });

      if (nonRealPlayersInWaitingMatches >= botConfig.maxBotsOnline) {
        this.registerSkip('max_bots_online_reached', {
          matchId: params.matchId,
          currentBots: nonRealPlayersInWaitingMatches,
          maxBotsOnline: botConfig.maxBotsOnline,
        });
        return;
      }

      const match = await prisma.match.findUnique({
        where: { id: params.matchId },
        include: { players: { include: { user: { include: { skillProfile: true } } } } },
      });

      if (!match) {
        this.registerSkip('match_not_found', { matchId: params.matchId });
        return;
      }
      if (match.status !== 'waiting') {
        this.registerSkip('match_not_waiting', { matchId: params.matchId, status: match.status });
        return;
      }
      if (match.players.length >= params.maxPlayers) {
        this.registerSkip('match_full', {
          matchId: params.matchId,
          players: match.players.length,
          maxPlayers: params.maxPlayers,
        });
        return;
      }

      const realPlayers = match.players.filter((player) => player.user.userType === 'REAL');
      if (realPlayers.length === 0) {
        this.registerSkip('no_real_user_in_match', { matchId: params.matchId });
        return;
      }

      const difficultyTuning = this.resolveDifficultyTuning(realPlayers);

      const currentPlayerIds = match.players.map((player) => player.userId);

      const ghostCandidate = await this.resolveGhostCandidate(match, currentPlayerIds);
      const simulatedCandidate = ghostCandidate
        ? null
        : await this.resolveSimulatedCandidate(currentPlayerIds, match.gameType, difficultyTuning);
      const selectedCandidate = ghostCandidate ?? simulatedCandidate;

      if (!selectedCandidate) {
        this.registerSkip('no_non_real_candidate', {
          matchId: params.matchId,
        });
        return;
      }

      await behaviorEngine.sleep(behaviorEngine.resolveJoinDelayMs(selectedCandidate.delayProfile));

      const recheckMatch = await prisma.match.findUnique({
        where: { id: params.matchId },
        include: { players: true },
      });

      if (!recheckMatch || recheckMatch.status !== 'waiting' || recheckMatch.players.length >= params.maxPlayers) {
        this.registerSkip('recheck_failed', {
          matchId: params.matchId,
          exists: !!recheckMatch,
          status: recheckMatch?.status,
          players: recheckMatch?.players.length,
          maxPlayers: params.maxPlayers,
        });
        return;
      }

      const alreadyJoined = recheckMatch.players.some((player) => player.userId === selectedCandidate.userId);
      if (alreadyJoined) {
        this.registerSkip('candidate_already_joined', {
          matchId: params.matchId,
          candidateUserId: selectedCandidate.userId,
          candidateType: selectedCandidate.joinType,
        });
        return;
      }

      await prisma.matchPlayer.create({
        data: {
          matchId: params.matchId,
          userId: selectedCandidate.userId,
          score: 0,
          xpGained: 0,
          eloChange: 0,
        },
      });

      logger.info('[SimulatedMatchOrchestrator] non-real player joined waiting match', {
        matchId: params.matchId,
        candidateUserId: selectedCandidate.userId,
        candidateType: selectedCandidate.joinType,
        difficultyMode: this.lastDifficultyMode,
      });
      this.totalJoined += 1;
      this.lastActionAt = new Date();

      const refreshed = await prisma.match.findUnique({
        where: { id: params.matchId },
        include: { players: true },
      });

      if (refreshed && refreshed.status === 'waiting' && refreshed.players.length < params.maxPlayers) {
        this.scheduledMatches.delete(params.matchId);
        this.scheduleFill(params);
      }
    } finally {
      this.scheduledMatches.delete(params.matchId);
    }
  }
}

export const simulatedMatchOrchestrator = new SimulatedMatchOrchestrator();
