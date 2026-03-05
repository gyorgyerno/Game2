import prisma from '../../prisma';
import logger from '../../logger';
import { config } from '../../config';
import { behaviorEngine } from './BehaviorEngine';

type ScheduleFillParams = {
  matchId: string;
  maxPlayers: number;
};

class SimulatedMatchOrchestrator {
  private scheduledMatches = new Set<string>();

  scheduleFill(params: ScheduleFillParams): void {
    if (!config.features.simPlayersEnabled) return;
    if (params.maxPlayers <= 1) return;
    if (this.scheduledMatches.has(params.matchId)) return;

    this.scheduledMatches.add(params.matchId);
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
      const match = await prisma.match.findUnique({
        where: { id: params.matchId },
        include: { players: true },
      });

      if (!match) return;
      if (match.status !== 'waiting') return;
      if (match.players.length >= params.maxPlayers) return;

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
        logger.info('[SimulatedMatchOrchestrator] no simulated candidate available', {
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
        return;
      }

      const alreadyJoined = recheckMatch.players.some((player) => player.userId === candidate.id);
      if (alreadyJoined) return;

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
