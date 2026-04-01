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

export interface UiConfig {
  /** Activează widget-ul Asistent AI în pagina de joc */
  aiAssistantEnabled: boolean;
}

// ─── Penalizare Abandon ───────────────────────────────────────────────────────
export interface AbandonPenaltyPerLevel {
  /** Nivelul jocului (1, 2, 3, ...) */
  level: number;
  /** XP dedus la abandon solo (ex: -20) */
  xpPenaltySolo: number;
  /** XP dedus la abandon multiplayer (ex: -50) */
  xpPenaltyMulti: number;
}

export interface AbandonConfig {
  /** Activează sistemul de penalizări la abandon */
  enabled: boolean;
  /** Jocuri pentru care sistemul de penalizări este activ (canonical gameType) */
  enabledGameTypes: string[];
  /** Penalizări per nivel */
  penaltiesPerLevel: AbandonPenaltyPerLevel[];
  /** Câte abandon-uri pe lună declanșează auto-block */
  autoBlockThreshold: number;
  /** Activează auto-block după N abandon-uri/lună */
  autoBlockEnabled: boolean;
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

export const DEFAULT_UI: Readonly<UiConfig> = {
  aiAssistantEnabled: true,
};

export const DEFAULT_ABANDON: Readonly<AbandonConfig> = {
  enabled: false,
  enabledGameTypes: [],
  penaltiesPerLevel: [
    { level: 1, xpPenaltySolo: -10, xpPenaltyMulti: -25 },
    { level: 2, xpPenaltySolo: -15, xpPenaltyMulti: -35 },
    { level: 3, xpPenaltySolo: -20, xpPenaltyMulti: -50 },
    { level: 4, xpPenaltySolo: -25, xpPenaltyMulti: -65 },
    { level: 5, xpPenaltySolo: -30, xpPenaltyMulti: -80 },
  ],
  autoBlockThreshold: 5,
  autoBlockEnabled: false,
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
  private ui: UiConfig = { ...DEFAULT_UI };
  private abandon: AbandonConfig = { ...DEFAULT_ABANDON, penaltiesPerLevel: [...DEFAULT_ABANDON.penaltiesPerLevel] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async load(prismaClient: any): Promise<void> {
    try {
      const rows: Array<{ key: string; value: string }> = await prismaClient.systemConfig.findMany();
      for (const row of rows) {
        try {
          const val = JSON.parse(row.value);
          if (row.key === 'elo')     this.elo    = { ...DEFAULT_ELO,    ...val };
          if (row.key === 'xp')      this.xp     = { ...DEFAULT_XP,     ...val };
          if (row.key === 'league')  this.league = { ...DEFAULT_LEAGUE, ...val };
          if (row.key === 'ui') {
            this.ui = {
              ...DEFAULT_UI,
              ...(typeof val.aiAssistantEnabled === 'boolean' ? { aiAssistantEnabled: val.aiAssistantEnabled } : {}),
            };
          }
          if (row.key === 'abandon') {
            const penaltiesPerLevel = Array.isArray(val.penaltiesPerLevel)
              ? val.penaltiesPerLevel
                  .filter((p: unknown): p is { level: number; xpPenaltySolo: number; xpPenaltyMulti: number } => {
                    if (!p || typeof p !== 'object') return false;
                    const pp = p as { level?: unknown; xpPenaltySolo?: unknown; xpPenaltyMulti?: unknown };
                    return Number.isFinite(pp.level as number)
                      && Number.isFinite(pp.xpPenaltySolo as number)
                      && Number.isFinite(pp.xpPenaltyMulti as number);
                  })
                  .map((p: { level: number; xpPenaltySolo: number; xpPenaltyMulti: number }) => ({
                    level: Math.max(1, Math.trunc(p.level)),
                    xpPenaltySolo: Math.min(0, Math.trunc(p.xpPenaltySolo)),
                    xpPenaltyMulti: Math.min(0, Math.trunc(p.xpPenaltyMulti)),
                  }))
              : [...DEFAULT_ABANDON.penaltiesPerLevel];

            this.abandon = {
              ...DEFAULT_ABANDON,
              enabled: typeof val.enabled === 'boolean' ? val.enabled : DEFAULT_ABANDON.enabled,
              enabledGameTypes: Array.isArray(val.enabledGameTypes)
                ? val.enabledGameTypes.filter((g: unknown): g is string => typeof g === 'string')
                : [...DEFAULT_ABANDON.enabledGameTypes],
              autoBlockEnabled: typeof val.autoBlockEnabled === 'boolean' ? val.autoBlockEnabled : DEFAULT_ABANDON.autoBlockEnabled,
              autoBlockThreshold: Number.isInteger(val.autoBlockThreshold)
                ? Math.max(1, Math.min(100, val.autoBlockThreshold))
                : DEFAULT_ABANDON.autoBlockThreshold,
              penaltiesPerLevel,
            };
          }
        } catch { /* invalid JSON — ignorat */ }
      }
    } catch (err) {
      console.error('[SystemConfig] Eroare la încărcare:', err);
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  getElo(): EloConfig       { return { ...this.elo }; }
  getXp(): XpConfig         { return { ...this.xp }; }
  getLeague(): LeagueConfig  { return { ...this.league }; }
  getUi(): UiConfig          { return { ...this.ui }; }
  getAbandon(): AbandonConfig { return { ...this.abandon, penaltiesPerLevel: [...this.abandon.penaltiesPerLevel] }; }

  // ─── Setters (doar în memorie — salvarea în DB se face în admin route) ────────

  setElo(cfg: Partial<EloConfig>): void       { Object.assign(this.elo, cfg); }
  setXp(cfg: Partial<XpConfig>): void         { Object.assign(this.xp, cfg); }
  setLeague(cfg: Partial<LeagueConfig>): void  { Object.assign(this.league, cfg); }
  setUi(cfg: Partial<UiConfig>): void          { Object.assign(this.ui, cfg); }
  setAbandon(cfg: Partial<AbandonConfig>): void {
    if (cfg.penaltiesPerLevel !== undefined) {
      this.abandon.penaltiesPerLevel = cfg.penaltiesPerLevel;
    }
    Object.assign(this.abandon, cfg);
  }

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
      elo:     this.getElo(),
      xp:      this.getXp(),
      league:  this.getLeague(),
      ui:      this.getUi(),
      abandon: this.getAbandon(),
      defaults: {
        elo:     DEFAULT_ELO,
        xp:      DEFAULT_XP,
        league:  DEFAULT_LEAGUE,
        ui:      DEFAULT_UI,
        abandon: DEFAULT_ABANDON,
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
