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
};

class SimulatedMatchOrchestrator {
  private scheduledMatches = new Set<string>();
  private totalScheduled = 0;
  private totalJoined = 0;
  private totalSkipped = 0;
  private lastSkipReason?: string;
  private lastActionAt?: Date;

  getHealthSnapshot(): OrchestratorHealth {
    return {
      scheduledMatches: this.scheduledMatches.size,
      totalScheduled: this.totalScheduled,
      totalJoined: this.totalJoined,
      totalSkipped: this.totalSkipped,
      lastSkipReason: this.lastSkipReason,
      lastActionAt: this.lastActionAt?.toISOString(),
    };
  }

  private registerSkip(reason: string, context: Record<string, unknown>): void {
    this.totalSkipped += 1;
    this.lastSkipReason = reason;
    this.lastActionAt = new Date();
    logger.info('[SimulatedMatchOrchestrator] skip', { reason, ...context });
  }

  scheduleFill(params: ScheduleFillParams): void {
    if (!config.features.simPlayersEnabled) {
      this.registerSkip('feature_flag_off', { matchId: params.matchId });
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

      const simulatedPlayersInWaitingMatches = await prisma.matchPlayer.count({
        where: {
          user: { userType: 'SIMULATED' },
          match: { status: 'waiting' },
        },
      });

      if (simulatedPlayersInWaitingMatches >= botConfig.maxBotsOnline) {
        this.registerSkip('max_bots_online_reached', {
          matchId: params.matchId,
          currentBots: simulatedPlayersInWaitingMatches,
          maxBotsOnline: botConfig.maxBotsOnline,
        });
        return;
      }

      const match = await prisma.match.findUnique({
        where: { id: params.matchId },
        include: { players: { include: { user: true } } },
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

      const realUsersInMatch = match.players.filter((player) => player.user.userType === 'REAL').length;
      if (realUsersInMatch === 0) {
        this.registerSkip('no_real_user_in_match', { matchId: params.matchId });
        return;
      }

      const currentPlayerIds = match.players.map((player) => player.userId);

      const candidate = await prisma.user.findFirst({
        where: {
          userType: 'SIMULATED',
          aiProfile: { is: { enabled: true } },
          id: { notIn: currentPlayerIds.length > 0 ? currentPlayerIds : ['__none__'] },
        },
        include: { aiProfile: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!candidate) {
        this.registerSkip('no_simulated_candidate', {
          matchId: params.matchId,
        });
        return;
      }

      await behaviorEngine.sleep(behaviorEngine.resolveJoinDelayMs(candidate.aiProfile));

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

      const alreadyJoined = recheckMatch.players.some((player) => player.userId === candidate.id);
      if (alreadyJoined) {
        this.registerSkip('candidate_already_joined', {
          matchId: params.matchId,
          simulatedUserId: candidate.id,
        });
        return;
      }

      await prisma.matchPlayer.create({
        data: {
          matchId: params.matchId,
          userId: candidate.id,
          score: 0,
          xpGained: 0,
          eloChange: 0,
        },
      });

      logger.info('[SimulatedMatchOrchestrator] simulated player joined waiting match', {
        matchId: params.matchId,
        simulatedUserId: candidate.id,
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
