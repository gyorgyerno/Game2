type Personality = 'FAST_RISKY' | 'SLOW_THINKER' | 'CASUAL_PLAYER' | 'PERFECTIONIST' | 'CHAOTIC_PLAYER' | string;

type BehaviorProfile = {
  skillLevel: number;
  thinkingSpeedMsMin: number;
  thinkingSpeedMsMax: number;
  mistakeRate: number;
  hesitationProbability: number;
  correctionProbability: number;
  personality: Personality;
};

type MoveDecision = {
  thinkingDelayMs: number;
  willHesitate: boolean;
  hesitationDelayMs: number;
  willMakeMistake: boolean;
  willCorrect: boolean;
  correctionDelayMs: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min: number, max: number): number {
  const safeMin = Math.floor(min);
  const safeMax = Math.floor(max);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function chance(probability: number): boolean {
  return Math.random() < clamp(probability, 0, 1);
}

class BehaviorEngine {
  private recentDecisionSignatures: string[] = [];

  resolveThinkingDelayMs(profile: BehaviorProfile): number {
    const min = Math.max(250, profile.thinkingSpeedMsMin);
    const max = Math.max(min + 100, profile.thinkingSpeedMsMax);
    let delay = randomInt(min, max);
    const hour = new Date().getHours();
    const circadianFactor = hour >= 23 || hour <= 6 ? 1.08 : hour >= 7 && hour <= 9 ? 0.94 : 1;
    delay = Math.floor(delay * circadianFactor);

    switch (profile.personality) {
      case 'FAST_RISKY':
        delay = Math.floor(delay * 0.82);
        break;
      case 'SLOW_THINKER':
        delay = Math.floor(delay * 1.18);
        break;
      case 'CHAOTIC_PLAYER':
        delay = Math.floor(delay * randomInt(75, 130) / 100);
        break;
      case 'PERFECTIONIST':
        delay = Math.floor(delay * 1.08);
        break;
      default:
        break;
    }

    // Mic jitter anti-pattern
    delay += randomInt(-180, 260);

    return clamp(delay, 250, 15000);
  }

  resolveJoinDelayMs(profile?: Partial<BehaviorProfile> | null): number {
    if (!profile) return randomInt(1000, 2600);

    const min = Math.max(800, profile.thinkingSpeedMsMin ?? 1400);
    const max = Math.max(min + 300, profile.thinkingSpeedMsMax ?? 3000);
    const personality = profile.personality ?? 'CASUAL_PLAYER';

    let delay = randomInt(min, max);
    if (personality === 'FAST_RISKY') delay = Math.floor(delay * 0.8);
    if (personality === 'SLOW_THINKER') delay = Math.floor(delay * 1.15);

    return clamp(delay, 700, 6500);
  }

  decideMove(profile: BehaviorProfile): MoveDecision {
    const thinkingDelayMs = this.resolveThinkingDelayMs(profile);

    let willHesitate = chance(profile.hesitationProbability);
    let hesitationDelayMs = willHesitate ? randomInt(800, 2800) : 0;

    const skillAdjustedMistakeRate = clamp(
      profile.mistakeRate - profile.skillLevel * 0.01,
      0.02,
      0.55,
    );

    let willMakeMistake = chance(skillAdjustedMistakeRate);
    let willCorrect = willMakeMistake && chance(profile.correctionProbability);
    let correctionDelayMs = willCorrect ? randomInt(2000, 4200) : 0;

    const signature = `${willHesitate}-${willMakeMistake}-${willCorrect}`;
    const lastTwoSame =
      this.recentDecisionSignatures.length >= 2 &&
      this.recentDecisionSignatures[this.recentDecisionSignatures.length - 1] === signature &&
      this.recentDecisionSignatures[this.recentDecisionSignatures.length - 2] === signature;

    if (lastTwoSame) {
      if (willMakeMistake) {
        willMakeMistake = false;
        willCorrect = false;
        correctionDelayMs = 0;
      } else {
        willHesitate = !willHesitate;
        hesitationDelayMs = willHesitate ? randomInt(900, 2600) : 0;
      }
    }

    this.recentDecisionSignatures.push(`${willHesitate}-${willMakeMistake}-${willCorrect}`);
    if (this.recentDecisionSignatures.length > 50) this.recentDecisionSignatures.shift();

    return {
      thinkingDelayMs,
      willHesitate,
      hesitationDelayMs,
      willMakeMistake,
      willCorrect,
      correctionDelayMs,
    };
  }

  async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const behaviorEngine = new BehaviorEngine();
export type { BehaviorProfile, MoveDecision };