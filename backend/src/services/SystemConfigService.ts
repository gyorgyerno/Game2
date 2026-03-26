// ─── SystemConfigService ──────────────────────────────────────────────────────
// Parametri globali ELO / XP / Ligi — editabili din admin, stocați în DB.
// Fallback automat la valorile hardcodate din shared/ dacă nu există override în DB.
// Singleton — un singur service în toată aplicația.

import type { League } from '@integrame/shared';

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export interface EloConfig {
  /** K-factor pentru jucători cu rating < thresholdMid (default: 32) */
  kFactorLow: number;
  /** K-factor pentru jucători cu rating < thresholdHigh (default: 24) */
  kFactorMid: number;
  /** K-factor pentru jucători cu rating ≥ thresholdHigh (default: 16) */
  kFactorHigh: number;
  /** Pragul dintre kFactorLow și kFactorMid (default: 1200) */
  thresholdMid: number;
  /** Pragul dintre kFactorMid și kFactorHigh (default: 1600) */
  thresholdHigh: number;
}

export interface XpConfig {
  /** XP câștigat pe locul 1 (default: 50) */
  perWin: number;
  /** XP câștigat în a doua jumătate a clasamentului (default: 10) */
  perLoss: number;
  /** XP câștigat în prima jumătate (non-top3) (default: 25) */
  perDraw: number;
  /** Bonus suplimentar pentru top 3 (default: 20) */
  bonusTop3: number;
}

export interface LeagueConfig {
  /** Rating minim pentru liga Silver (default: 1200) */
  silver: number;
  /** Rating minim pentru liga Gold (default: 1400) */
  gold: number;
  /** Rating minim pentru liga Platinum (default: 1600) */
  platinum: number;
  /** Rating minim pentru liga Diamond (default: 1800) */
  diamond: number;
}

// ─── Default-uri (identice cu shared/) ───────────────────────────────────────

export const DEFAULT_ELO: Readonly<EloConfig> = {
  kFactorLow: 32,
  kFactorMid: 24,
  kFactorHigh: 16,
  thresholdMid: 1200,
  thresholdHigh: 1600,
};

export const DEFAULT_XP: Readonly<XpConfig> = {
  perWin: 50,
  perLoss: 10,
  perDraw: 25,
  bonusTop3: 20,
};

export const DEFAULT_LEAGUE: Readonly<LeagueConfig> = {
  silver: 1200,
  gold: 1400,
  platinum: 1600,
  diamond: 1800,
};

// ─── Limite de validare ───────────────────────────────────────────────────────

export const ELO_LIMITS = {
  kFactor: { min: 4, max: 128 },
  threshold: { min: 100, max: 9000 },
};

export const XP_LIMITS = {
  perWin:    { min: 0, max: 10000 },
  perLoss:   { min: 0, max: 10000 },
  perDraw:   { min: 0, max: 10000 },
  bonusTop3: { min: 0, max: 10000 },
};

export const LEAGUE_LIMITS = {
  rating: { min: 100, max: 9000 },
};

// ─── Service ──────────────────────────────────────────────────────────────────

class SystemConfigService {
  private elo: EloConfig = { ...DEFAULT_ELO };
  private xp: XpConfig = { ...DEFAULT_XP };
  private league: LeagueConfig = { ...DEFAULT_LEAGUE };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async load(prismaClient: any): Promise<void> {
    try {
      const rows: Array<{ key: string; value: string }> = await prismaClient.systemConfig.findMany();
      for (const row of rows) {
        try {
          const val = JSON.parse(row.value);
          if (row.key === 'elo')    this.elo    = { ...DEFAULT_ELO,    ...val };
          if (row.key === 'xp')     this.xp     = { ...DEFAULT_XP,     ...val };
          if (row.key === 'league') this.league = { ...DEFAULT_LEAGUE, ...val };
        } catch { /* invalid JSON — ignorat */ }
      }
    } catch (err) {
      console.error('[SystemConfig] Eroare la încărcare:', err);
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  getElo(): EloConfig    { return { ...this.elo }; }
  getXp(): XpConfig      { return { ...this.xp }; }
  getLeague(): LeagueConfig { return { ...this.league }; }

  // ─── Setters (doar în memorie — salvarea în DB se face în admin route) ────────

  setElo(cfg: Partial<EloConfig>): void    { Object.assign(this.elo, cfg); }
  setXp(cfg: Partial<XpConfig>): void      { Object.assign(this.xp, cfg); }
  setLeague(cfg: Partial<LeagueConfig>): void { Object.assign(this.league, cfg); }

  // ─── Funcții de calcul (înlocuiesc cele din shared/) ──────────────────────────

  eloKFactor(rating: number): number {
    if (rating < this.elo.thresholdMid)  return this.elo.kFactorLow;
    if (rating < this.elo.thresholdHigh) return this.elo.kFactorMid;
    return this.elo.kFactorHigh;
  }

  calculateELO(
    playerRating: number,
    opponentRatings: number[],
    position: number,
    totalPlayers: number,
  ): number {
    const avgOpponent = opponentRatings.reduce((a, b) => a + b, 0) / opponentRatings.length;
    const expected = 1 / (1 + Math.pow(10, (avgOpponent - playerRating) / 400));
    const actualScore = 1 - (position - 1) / (totalPlayers - 1 || 1);
    const k = this.eloKFactor(playerRating);
    return Math.round(playerRating + k * (actualScore - expected));
  }

  calculateXPGained(position: number, totalPlayers: number): number {
    if (position === 1)                                   return this.xp.perWin + this.xp.bonusTop3 * 2;
    if (position <= 3)                                    return this.xp.perWin + this.xp.bonusTop3;
    if (position <= Math.ceil(totalPlayers / 2))          return this.xp.perDraw;
    return this.xp.perLoss;
  }

  ratingToLeague(rating: number): League {
    if (rating < this.league.silver)   return 'bronze';
    if (rating < this.league.gold)     return 'silver';
    if (rating < this.league.platinum) return 'gold';
    if (rating < this.league.diamond)  return 'platinum';
    return 'diamond';
  }

  // ─── Snapshot complet (pentru admin GET) ─────────────────────────────────────

  getSnapshot() {
    return {
      elo:    this.getElo(),
      xp:     this.getXp(),
      league: this.getLeague(),
      defaults: {
        elo:    DEFAULT_ELO,
        xp:     DEFAULT_XP,
        league: DEFAULT_LEAGUE,
      },
      limits: {
        elo: ELO_LIMITS,
        xp:  XP_LIMITS,
        league: LEAGUE_LIMITS,
      },
    };
  }
}

export const systemConfigService = new SystemConfigService();
