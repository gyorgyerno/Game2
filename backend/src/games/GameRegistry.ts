// ─── GameRegistry — înregistrare și acces jocuri ─────────────────────────────
// Pentru a adăuga un joc nou:
//   1. Creează folder: backend/src/games/<numejoc>/
//   2. Implementează IGame
//   3. Importă și înregistrează cu registry.register(MyGame)
//   NU modifica matchHandler.ts, IGame.ts sau alte jocuri.

import { IGame, GameRulesConfig } from './IGame';
import { IntegrameGame } from './integrame/IntegrameGame';
import { LabirinturiGame, MazeGame } from './maze/MazeGame';

// Key format: "gameType:level" or "gameType:null" for base override
type OverrideKey = string;

function makeKey(gameType: string, level: number | null): OverrideKey {
  return `${gameType}:${level ?? 'null'}`;
}

class GameRegistry {
  private games: Map<string, IGame> = new Map();
  // In-memory cache of DB overrides — keyed by "gameType:level" or "gameType:null"
  private overrides: Map<OverrideKey, Partial<GameRulesConfig>> = new Map();

  register(game: IGame): void {
    this.games.set(game.meta.id, game);
  }

  get(gameType: string): IGame | undefined {
    return this.games.get(gameType);
  }

  /** Returnează regulile unui joc (fără override) */
  getRules(gameType: string) {
    return this.games.get(gameType)?.rules;
  }

  /**
   * Returnează regulile efective pentru un joc + nivel, îmbinând:
   * 1. Default-urile din cod
   * 2. Override-ul de bază pentru joc (level=null)
   * 3. Override-ul specific nivelului (level=N), dacă există
   */
  getEffectiveRules(gameType: string, level?: number): GameRulesConfig | undefined {
    const game = this.games.get(gameType);
    if (!game) return undefined;

    const base: GameRulesConfig = { ...game.rules };
    const baseOverride = this.overrides.get(makeKey(gameType, null));
    if (baseOverride) Object.assign(base, filterDefined(baseOverride));
    if (level !== undefined && level !== null) {
      const levelOverride = this.overrides.get(makeKey(gameType, level));
      if (levelOverride) Object.assign(base, filterDefined(levelOverride));
    }
    return base;
  }

  /** Setează un override în memorie (apelat de adminRoute după salvare în DB) */
  setScoringOverride(gameType: string, level: number | null, override: Partial<GameRulesConfig>): void {
    this.overrides.set(makeKey(gameType, level), override);
  }

  /** Șterge un override dinimemorie */
  removeScoringOverride(gameType: string, level: number | null): void {
    this.overrides.delete(makeKey(gameType, level));
  }

  /** Încarcă toate override-urile din DB în memorie (apelat la startup și după fiecare save admin) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async loadScoringOverrides(prismaClient: any): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (prismaClient as any).gameScoringConfig.findMany();
      this.overrides.clear();
      for (const row of rows) {
        const override: Partial<GameRulesConfig> = {};
        if (row.pointsPerCorrect   !== null) override.pointsPerCorrect   = row.pointsPerCorrect;
        if (row.pointsPerMistake   !== null) override.pointsPerMistake   = row.pointsPerMistake;
        if (row.bonusFirstFinisher !== null) override.bonusFirstFinisher = row.bonusFirstFinisher;
        if (row.bonusCompletion    !== null) override.bonusCompletion    = row.bonusCompletion;
        if (row.timeLimitSeconds   !== null) override.timeLimit          = row.timeLimitSeconds;
        if (row.forfeitBonus       !== null) override.forfeitBonus       = row.forfeitBonus;
        this.overrides.set(makeKey(row.gameType, row.level), override);
      }
    } catch (err) {
      // Non-fatal — folosim default-urile din cod
      console.error('[GameRegistry] Failed to load scoring overrides:', err);
    }
  }

  /**
   * Calculează scorul live folosind regulile efective pentru joc + nivel.
   * Formula: max(0, correctAnswers * ppc + mistakes * ppm)
   */
  calculateLiveScoreForLevel(gameType: string, level: number, correctAnswers: number, mistakes: number): number {
    const rules = this.getEffectiveRules(gameType, level);
    if (!rules) return 0;
    return Math.max(0, correctAnswers * rules.pointsPerCorrect + mistakes * rules.pointsPerMistake);
  }

  /**
   * Calculează scorul final folosind regulile efective pentru joc + nivel.
   * Formula: max(0, base + bonusCompletion + (isFirst ? bonusFirstFinisher : 0))
   */
  calculateFinalScoreForLevel(
    gameType: string,
    level: number,
    correctAnswers: number,
    mistakes: number,
    isFirstFinisher: boolean
  ): number {
    const rules = this.getEffectiveRules(gameType, level);
    if (!rules) return 0;
    let score = correctAnswers * rules.pointsPerCorrect + mistakes * rules.pointsPerMistake + rules.bonusCompletion;
    if (isFirstFinisher) score += rules.bonusFirstFinisher;
    return Math.max(0, score);
  }

  /** Calculează scorul live prin delegare la jocul specific (fără override de nivel) */
  calculateLiveScore(gameType: string, correctAnswers: number, mistakes: number): number {
    const game = this.games.get(gameType);
    if (!game) return 0;
    return game.calculateLiveScore(correctAnswers, mistakes);
  }

  /** Calculează scorul final prin delegare la jocul specific (fără override de nivel) */
  calculateFinalScore(
    gameType: string,
    correctAnswers: number,
    mistakes: number,
    isFirstFinisher: boolean
  ): number {
    const game = this.games.get(gameType);
    if (!game) return 0;
    return game.calculateFinalScore(correctAnswers, mistakes, isFirstFinisher);
  }

  /** Bonus acordat când adversarul abandonează */
  getForfeitBonus(gameType: string): number {
    return this.games.get(gameType)?.rules.forfeitBonus ?? 10;
  }

  /** Lista tuturor jocurilor disponibile */
  listAll(): IGame[] {
    return Array.from(this.games.values());
  }

  isRegistered(gameType: string): boolean {
    return this.games.has(gameType);
  }
}

function filterDefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  ) as Partial<T>;
}

// Singleton — un singur registry în întreaga aplicație
export const gameRegistry = new GameRegistry();

// ─── Înregistrare jocuri ──────────────────────────────────────────────────────
// Adaugă joc nou: gameRegistry.register(MyNewGame);
gameRegistry.register(IntegrameGame);
gameRegistry.register(MazeGame);
gameRegistry.register(LabirinturiGame);
