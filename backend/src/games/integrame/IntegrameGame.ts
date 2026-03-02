import { IGame, GameMeta, GameRulesConfig } from '../IGame';

// ─── Integrame — reguli și scoring ───────────────────────────────────────────

const meta: GameMeta = {
  id: 'integrame',
  name: 'Integrame',
  description: 'Rezolvă integrama mai repede decât adversarul',
  icon: '🧩',
  primaryColor: '#7c3aed',   // violet-600
  secondaryColor: '#ede9fe', // violet-100
};

const rules: GameRulesConfig = {
  pointsPerCorrect: 10,
  pointsPerMistake: -5,
  bonusFirstFinisher: 10,
  bonusCompletion: 20,
  timeLimit: 180,
  forfeitBonus: 10,
};

export const IntegrameGame: IGame = {
  meta,
  rules,

  calculateLiveScore(correctAnswers: number, mistakes: number): number {
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
      mistakes * rules.pointsPerMistake +
      rules.bonusCompletion;
    if (isFirstFinisher) score += rules.bonusFirstFinisher;
    return Math.max(0, score);
  },
};
