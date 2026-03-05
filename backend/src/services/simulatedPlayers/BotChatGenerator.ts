import prisma from '../../prisma';
import logger from '../../logger';
import { config } from '../../config';
import { runtimeMetricsMonitor } from './RuntimeMetricsMonitor';

type BotChatMessage = {
  id: string;
  type: 'bot_chat';
  text: string;
  gameType: string;
  botUserId: string;
  botUsername: string;
  createdAt: string;
};

type BotChatStatus = {
  running: boolean;
  tickMs: number;
  minCooldownMs: number;
  recentMessagesCount: number;
  totalTicks: number;
  totalGenerated: number;
  skippedDisabled: number;
  skippedCooldown: number;
  skippedNoCandidate: number;
  skippedBackpressure: number;
  skippedCircuitBreaker: number;
  totalErrors: number;
  consecutiveErrors: number;
  circuitBreakerActive: boolean;
  circuitBreakerUntil?: string;
  lastErrorAt?: string;
  lastError?: string;
  lastDecisionCpuMs: number;
  p95DecisionCpuMs: number;
  lastEmitAt?: string;
};

class BotChatGenerator {
  private readonly tickMs = 20000;
  private readonly minCooldownMs = 60000;
  private timer: NodeJS.Timeout | null = null;
  private messages: BotChatMessage[] = [];
  private lastEmitAt?: Date;

  private totalTicks = 0;
  private totalGenerated = 0;
  private skippedDisabled = 0;
  private skippedCooldown = 0;
  private skippedNoCandidate = 0;
  private skippedBackpressure = 0;
  private skippedCircuitBreaker = 0;
  private totalErrors = 0;
  private consecutiveErrors = 0;
  private circuitBreakerUntil?: Date;
  private lastErrorAt?: Date;
  private lastError?: string;
  private lastDecisionCpuMs = 0;
  private decisionSamplesMs: number[] = [];

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick(false);
    }, this.tickMs);
    logger.info('[BOT_CHAT] BotChatGenerator started', {
      tickMs: this.tickMs,
      minCooldownMs: this.minCooldownMs,
    });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('[BOT_CHAT] BotChatGenerator stopped');
  }

  getStatus(): BotChatStatus {
    return {
      running: Boolean(this.timer),
      tickMs: this.tickMs,
      minCooldownMs: this.minCooldownMs,
      recentMessagesCount: this.messages.length,
      totalTicks: this.totalTicks,
      totalGenerated: this.totalGenerated,
      skippedDisabled: this.skippedDisabled,
      skippedCooldown: this.skippedCooldown,
      skippedNoCandidate: this.skippedNoCandidate,
      skippedBackpressure: this.skippedBackpressure,
      skippedCircuitBreaker: this.skippedCircuitBreaker,
      totalErrors: this.totalErrors,
      consecutiveErrors: this.consecutiveErrors,
      circuitBreakerActive: Boolean(this.circuitBreakerUntil && this.circuitBreakerUntil.getTime() > Date.now()),
      circuitBreakerUntil: this.circuitBreakerUntil?.toISOString(),
      lastErrorAt: this.lastErrorAt?.toISOString(),
      lastError: this.lastError,
      lastDecisionCpuMs: this.lastDecisionCpuMs,
      p95DecisionCpuMs: this.computeP95(this.decisionSamplesMs),
      lastEmitAt: this.lastEmitAt?.toISOString(),
    };
  }

  getRecentMessages(limit = 20): BotChatMessage[] {
    const clamped = Math.min(100, Math.max(1, Math.floor(limit)));
    return this.messages.slice(0, clamped);
  }

  async forceGenerate(): Promise<BotChatMessage | null> {
    return this.tick(true);
  }

  private async tick(force: boolean): Promise<BotChatMessage | null> {
    const startedAt = Date.now();
    this.totalTicks += 1;

    if (!force && this.circuitBreakerUntil && this.circuitBreakerUntil.getTime() > Date.now()) {
      this.skippedCircuitBreaker += 1;
      this.recordDecisionCpuMs(Date.now() - startedAt);
      return null;
    }

    const runtime = runtimeMetricsMonitor.getSnapshot();
    if (!force && runtime.eventLoopLagMs > config.simulatedOps.maxLagForNonCriticalMs) {
      this.skippedBackpressure += 1;
      this.recordDecisionCpuMs(Date.now() - startedAt);
      return null;
    }

    try {
      const botConfig = await prisma.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });
      const enabledByConfig = Boolean(botConfig?.enabled && botConfig?.chatEnabled);
      const enabledByFlags = config.features.simPlayersEnabled && config.features.botChatEnabled;

      if (!enabledByConfig || !enabledByFlags) {
        this.skippedDisabled += 1;
        return null;
      }

      const now = Date.now();
      if (!force && this.lastEmitAt && now - this.lastEmitAt.getTime() < this.minCooldownMs) {
        this.skippedCooldown += 1;
        return null;
      }

      const candidates = await prisma.aIPlayerProfile.findMany({
        where: {
          enabled: true,
          user: { userType: 'SIMULATED' },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        take: 25,
        orderBy: { updatedAt: 'desc' },
      });

      if (!candidates.length) {
        this.skippedNoCandidate += 1;
        return null;
      }

      const profile = candidates[Math.floor(Math.random() * candidates.length)];
      const preferredGames = this.parsePreferredGames(profile.preferredGames);
      const gameType = preferredGames[Math.floor(Math.random() * preferredGames.length)] || 'integrame';
      const text = this.buildMessage(gameType);

      const message: BotChatMessage = {
        id: `bot-chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        type: 'bot_chat',
        text,
        gameType,
        botUserId: profile.user.id,
        botUsername: profile.user.username,
        createdAt: new Date().toISOString(),
      };

      this.lastEmitAt = new Date();
      this.totalGenerated += 1;
      this.messages.unshift(message);
      if (this.messages.length > 100) this.messages.length = 100;
      this.consecutiveErrors = 0;
      this.circuitBreakerUntil = undefined;

      logger.info('[BOT_CHAT] Chat message generated', {
        botUserId: message.botUserId,
        botUsername: message.botUsername,
        gameType: message.gameType,
        messageId: message.id,
        forced: force,
      });

      return message;
    } catch (error) {
      this.totalErrors += 1;
      this.consecutiveErrors += 1;
      this.lastErrorAt = new Date();
      this.lastError = error instanceof Error ? error.message : String(error);

      if (this.consecutiveErrors >= config.simulatedOps.generatorCircuitBreakerConsecutiveErrors) {
        this.circuitBreakerUntil = new Date(Date.now() + config.simulatedOps.generatorCircuitBreakerMs);
      }

      logger.error('[BOT_CHAT] tick failed', {
        error: this.lastError,
        consecutiveErrors: this.consecutiveErrors,
        circuitBreakerUntil: this.circuitBreakerUntil?.toISOString(),
      });
      return null;
    } finally {
      this.recordDecisionCpuMs(Date.now() - startedAt);
    }
  }

  private recordDecisionCpuMs(value: number): void {
    this.lastDecisionCpuMs = value;
    this.decisionSamplesMs.push(value);
    if (this.decisionSamplesMs.length > 300) this.decisionSamplesMs.shift();
  }

  private computeP95(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return sorted[index] ?? 0;
  }

  private parsePreferredGames(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
        if (filtered.length > 0) return filtered;
      }
    } catch {
      return ['integrame', 'maze'];
    }
    return ['integrame', 'maze'];
  }

  private buildMessage(gameType: string): string {
    const templates = [
      `GG pe ${gameType}, joc bun!`,
      `Mai încerc un run pe ${gameType}.`,
      `Aproape perfect pe ${gameType}, încălzire bună.`,
      `Anyone pentru un meci rapid de ${gameType}?`,
    ];
    return templates[Math.floor(Math.random() * templates.length)] || templates[0];
  }
}

export const botChatGenerator = new BotChatGenerator();
