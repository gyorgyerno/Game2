// ─── IGame — contractul comun pentru orice joc ───────────────────────────────
// Fiecare joc NOU trebuie să implementeze această interfață.
// matchHandler.ts NU se modifică — citește regulile prin GameRegistry.

export interface GameRulesConfig {
  /** Puncte per răspuns corect */
  pointsPerCorrect: number;
  /** Puncte per greșeală (negativ = penalizare) */
  pointsPerMistake: number;
  /** Bonus pentru cel care termină primul */
  bonusFirstFinisher: number;
  /** Bonus pentru finalizarea completă */
  bonusCompletion: number;
  /** Timp maxim joc în secunde */
  timeLimit: number;
  /** Bonus acordat câștigătorului prin forfeit (adversar abandonează) */
  forfeitBonus: number;
}

export interface GameMeta {
  /** ID unic al jocului — același cu gameType din DB */
  id: string;
  /** Nume afișat în UI */
  name: string;
  /** Descriere scurtă */
  description: string;
  /** Emoji / icon */
  icon: string;
  /** Culoare primară (CSS hex sau tailwind class) */
  primaryColor: string;
  /** Culoare secundară */
  secondaryColor: string;
}

export interface IGame {
  meta: GameMeta;
  rules: GameRulesConfig;

  /**
   * Calculează scorul live (în timp ce jucătorul joacă).
   * Apelat la fiecare PLAYER_PROGRESS.
   */
  calculateLiveScore(correctAnswers: number, mistakes: number): number;

  /**
   * Calculează scorul final când jucătorul termină.
   * Apelat la PLAYER_FINISH.
   */
  calculateFinalScore(correctAnswers: number, mistakes: number, isFirstFinisher: boolean): number;

  /**
   * Validare opțională a unei acțiuni de joc.
   * Returnează true dacă acțiunea e validă.
   */
  validateAction?(action: Record<string, unknown>): boolean;
}
