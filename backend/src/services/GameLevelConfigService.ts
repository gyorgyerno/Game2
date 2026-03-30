// ─── GameLevelConfigService ───────────────────────────────────────────────────
// Configurează nivelele fiecărui joc din admin.
// Singleton — un singur service în toată aplicația, datele ținute în memorie.
// Sursa de adevăr: tabelul `game_level_configs` din DB.
// La startup: se încarcă din DB; dacă e gol → se populează cu defaults (nivelele 1–5).

import type { PrismaClient } from '@prisma/client';

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export interface LevelConfig {
  id: string;
  gameType: string;
  level: number;
  displayName: string;
  /** Dificultate 0–100. 0 = ușor, 100 = foarte greu. */
  difficultyValue: number;
  isActive: boolean;
  maxPlayers: number;
  /** Numărul de victorii necesare pentru a debloca nivelul următor. */
  winsToUnlock: number;
  /** Numărul de jocuri/puzzle-uri disponibile pentru nivelul solo. */
  gamesPerLevel: number;
  updatedBy: string | null;
}

type LevelConfigRow = {
  id: string;
  gameType: string;
  level: number;
  displayName: string;
  difficultyValue: number;
  isActive: boolean;
  maxPlayers: number;
  winsToUnlock: number | null;
  gamesPerLevel: number | null;
  updatedBy: string | null;
};

// ─── Default-uri per nivel (1–5) ─────────────────────────────────────────────

const DEFAULT_LEVELS: Omit<LevelConfig, 'id' | 'gameType' | 'updatedBy'>[] = [
  { level: 1, displayName: 'Nivel 1',  difficultyValue: 10,  isActive: true, maxPlayers: 2,  winsToUnlock: 5, gamesPerLevel: 3 },
  { level: 2, displayName: 'Nivel 2',  difficultyValue: 30,  isActive: true, maxPlayers: 4,  winsToUnlock: 5, gamesPerLevel: 3 },
  { level: 3, displayName: 'Nivel 3',  difficultyValue: 50,  isActive: true, maxPlayers: 8,  winsToUnlock: 5, gamesPerLevel: 3 },
  { level: 4, displayName: 'Nivel 4',  difficultyValue: 70,  isActive: true, maxPlayers: 12, winsToUnlock: 5, gamesPerLevel: 3 },
  { level: 5, displayName: 'Nivel 5',  difficultyValue: 90,  isActive: true, maxPlayers: 20, winsToUnlock: 5, gamesPerLevel: 3 },
];

const SEEDED_GAME_TYPES = ['integrame', 'maze', 'slogane'];

// ─── Service ──────────────────────────────────────────────────────────────────

class GameLevelConfigService {
  /** Map<gameType, Map<level, LevelConfig>> */
  private cache = new Map<string, Map<number, LevelConfig>>();
  private loaded = false;

  private toLevelConfig(row: LevelConfigRow): LevelConfig {
    return {
      id: row.id,
      gameType: row.gameType,
      level: row.level,
      displayName: row.displayName,
      difficultyValue: row.difficultyValue,
      isActive: row.isActive,
      maxPlayers: row.maxPlayers,
      winsToUnlock: row.winsToUnlock ?? 5,
      gamesPerLevel: row.gamesPerLevel ?? 3,
      updatedBy: row.updatedBy,
    };
  }

  // ─── Încărcare din DB ───────────────────────────────────────────────────────

  async load(prisma: PrismaClient): Promise<void> {
    // Seed implicit: dacă un game type nu are nicio intrare, o adăugăm cu defaults.
    for (const gameType of SEEDED_GAME_TYPES) {
      const count = await prisma.gameLevelConfig.count({ where: { gameType } });
      if (count === 0) {
        for (const d of DEFAULT_LEVELS) {
          await prisma.gameLevelConfig.create({ data: { ...d, gameType } });
        }
      }
    }

    // Încarcă totul din DB în memorie
    const rows = await prisma.gameLevelConfig.findMany({
      orderBy: [{ gameType: 'asc' }, { level: 'asc' }],
    }) as unknown as LevelConfigRow[];

    this.cache.clear();
    for (const row of rows) {
      if (!this.cache.has(row.gameType)) {
        this.cache.set(row.gameType, new Map());
      }
      this.cache.get(row.gameType)!.set(row.level, this.toLevelConfig(row));
    }

    this.loaded = true;
  }

  // ─── Citire ─────────────────────────────────────────────────────────────────

  /** Returnează toate nivelele active pentru un joc, sortate crescător. */
  getActiveLevels(gameType: string): LevelConfig[] {
    const normalized = this.normalizeGameType(gameType);
    const byGame = this.cache.get(normalized);
    if (!byGame) return [];
    return [...byGame.values()]
      .filter((c) => c.isActive)
      .sort((a, b) => a.level - b.level);
  }

  /** Returnează toate nivelele (inclusiv inactive) pentru un joc. */
  getAllLevels(gameType: string): LevelConfig[] {
    const normalized = this.normalizeGameType(gameType);
    const byGame = this.cache.get(normalized);
    if (!byGame) return [];
    return [...byGame.values()].sort((a, b) => a.level - b.level);
  }

  /** Returnează configurația unui nivel specific. Null dacă nu există sau e inactiv. */
  getLevelConfig(gameType: string, level: number): LevelConfig | null {
    const normalized = this.normalizeGameType(gameType);
    return this.cache.get(normalized)?.get(level) ?? null;
  }

  /** Validează că un nivel există și este activ. */
  isLevelActive(gameType: string, level: number): boolean {
    const cfg = this.getLevelConfig(gameType, level);
    return cfg !== null && cfg.isActive;
  }

  /** maxPlayers pentru un nivel. Fallback = 2 dacă nivelul nu există în DB. */
  getMaxPlayers(gameType: string, level: number): number {
    return this.getLevelConfig(gameType, level)?.maxPlayers ?? 2;
  }

  /** difficultyValue (0–100) pentru un nivel. Fallback = 50. */
  getDifficulty(gameType: string, level: number): number {
    return this.getLevelConfig(gameType, level)?.difficultyValue ?? 50;
  }

  // ─── Scriere (folosit din routes/admin.ts) ───────────────────────────────────

  /**
   * Creează sau actualizează un nivel în DB și în cache.
   * Dacă nivelul nu există → createMany cu câmpurile furnizate.
   */
  async upsertLevel(
    prisma: PrismaClient,
    gameType: string,
    level: number,
    data: Partial<Omit<LevelConfig, 'id' | 'gameType' | 'level'>>,
    updatedBy?: string,
  ): Promise<LevelConfig> {
    const normalized = this.normalizeGameType(gameType);

    const existing = await prisma.gameLevelConfig.findFirst({
      where: { gameType: normalized, level },
    });

    let row: LevelConfigRow;
    if (existing) {
      row = await prisma.gameLevelConfig.update({
        where: { id: existing.id },
        data: { ...data, updatedBy: updatedBy ?? null },
      }) as unknown as LevelConfigRow;
    } else {
      const defaults = DEFAULT_LEVELS.find((d) => d.level === level) ?? DEFAULT_LEVELS[0]!;
      row = await prisma.gameLevelConfig.create({
        data: {
          gameType: normalized,
          level,
          displayName: data.displayName ?? defaults.displayName,
          difficultyValue: data.difficultyValue ?? defaults.difficultyValue,
          isActive: data.isActive ?? defaults.isActive,
          maxPlayers: data.maxPlayers ?? defaults.maxPlayers,
          winsToUnlock: data.winsToUnlock ?? defaults.winsToUnlock ?? 5,
          gamesPerLevel: data.gamesPerLevel ?? defaults.gamesPerLevel ?? 3,
          updatedBy: updatedBy ?? null,
        },
      } as any) as unknown as LevelConfigRow;
    }

    const cfg: LevelConfig = this.toLevelConfig(row);

    if (!this.cache.has(normalized)) this.cache.set(normalized, new Map());
    this.cache.get(normalized)!.set(level, cfg);

    return cfg;
  }

  /** Șterge un nivel din DB și din cache. */
  async deleteLevel(
    prisma: PrismaClient,
    gameType: string,
    level: number,
  ): Promise<boolean> {
    const normalized = this.normalizeGameType(gameType);
    const existing = await prisma.gameLevelConfig.findFirst({
      where: { gameType: normalized, level },
    });
    if (!existing) return false;

    await prisma.gameLevelConfig.delete({ where: { id: existing.id } });
    this.cache.get(normalized)?.delete(level);
    return true;
  }

  /** Returnează toate game type-urile care au cel puțin un nivel configurat. */
  getConfiguredGameTypes(): string[] {
    return [...this.cache.keys()];
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** 'labirinturi' → 'maze' (normalizare alias frontend) */
  private normalizeGameType(gameType: string): string {
    return gameType === 'labirinturi' ? 'maze' : gameType;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const gameLevelConfigService = new GameLevelConfigService();
