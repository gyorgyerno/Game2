import { IGame, GameMeta, GameRulesConfig } from '../IGame';

// ─── Maze — labirint, reguli și scoring DIFERITE față de Integrame ───────────
// Acesta e un exemplu dummy. Logica reală se implementează când se face jocul.
//
// DIFERENȚE față de Integrame:
//  - puncte per pas corect: 5 (nu 10)
//  - penalizare pentru pereți loviți: -3 (nu -5)
//  - fără bonus de finalizare — primul care iese din labirint câștigă
//  - timp mai scurt: 60s
//  - bonus prim finisher mult mai mare: 50 pts

const meta: GameMeta = {
  id: 'maze',
  name: 'Labirint',
  description: 'Găsește ieșirea din labirint mai repede decât adversarul',
  icon: '🌀',
  primaryColor: '#059669',   // emerald-600
  secondaryColor: '#d1fae5', // emerald-100
};

const rules: GameRulesConfig = {
  pointsPerCorrect: 5,      // pas corect în labirint
  pointsPerMistake: -3,     // lovit perete
  bonusFirstFinisher: 50,   // primul care iese câștigă mare
  bonusCompletion: 0,       // nu există bonus finalizare separat
  timeLimit: 60,            // doar 60s
  forfeitBonus: 15,         // bonus forfeit mai mare (meci scurt)
};

export const MazeGame: IGame = {
  meta,
  rules,

  calculateLiveScore(correctAnswers: number, mistakes: number): number {
    // În labirint: scor = pași corecți * 5 - pereți loviți * 3
    const score =
      correctAnswers * rules.pointsPerCorrect +
      mistakes * rules.pointsPerMistake;
    return Math.max(0, score);
  },

  calculateFinalScore(
    correctAnswers: number,
    mistakes: number,
    isFirstFinisher: boolean
  ): number {
    let score =
      correctAnswers * rules.pointsPerCorrect +
      mistakes * rules.pointsPerMistake;
    // Bonusul majoritar merge la primul care iese din labirint
    if (isFirstFinisher) score += rules.bonusFirstFinisher;
    return Math.max(0, score);
  },

  validateAction(action: Record<string, unknown>): boolean {
    // Validare mișcare: direcție validă
    const validDirections = ['up', 'down', 'left', 'right'];
    return typeof action.direction === 'string' &&
      validDirections.includes(action.direction);
  },
};
