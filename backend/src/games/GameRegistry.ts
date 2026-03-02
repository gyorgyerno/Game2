// ─── GameRegistry — înregistrare și acces jocuri ─────────────────────────────
// Pentru a adăuga un joc nou:
//   1. Creează folder: backend/src/games/<numejoc>/
//   2. Implementează IGame
//   3. Importă și înregistrează cu registry.register(MyGame)
//   NU modifica matchHandler.ts, IGame.ts sau alte jocuri.

import { IGame } from './IGame';
import { IntegrameGame } from './integrame/IntegrameGame';
import { MazeGame } from './maze/MazeGame';

class GameRegistry {
  private games: Map<string, IGame> = new Map();

  register(game: IGame): void {
    this.games.set(game.meta.id, game);
  }

  get(gameType: string): IGame | undefined {
    return this.games.get(gameType);
  }

  /** Returnează regulile unui joc — folosit de matchHandler */
  getRules(gameType: string) {
    return this.games.get(gameType)?.rules;
  }

  /** Calculează scorul live prin delegare la jocul specific */
  calculateLiveScore(gameType: string, correctAnswers: number, mistakes: number): number {
    const game = this.games.get(gameType);
    if (!game) return 0;
    return game.calculateLiveScore(correctAnswers, mistakes);
  }

  /** Calculează scorul final prin delegare la jocul specific */
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

// Singleton — un singur registry în întreaga aplicație
export const gameRegistry = new GameRegistry();

// ─── Înregistrare jocuri ──────────────────────────────────────────────────────
// Adaugă joc nou: gameRegistry.register(MyNewGame);
gameRegistry.register(IntegrameGame);
gameRegistry.register(MazeGame);
