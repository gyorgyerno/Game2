/**
 * BonusChallengeService
 * ─────────────────────
 * Gestionează challengele de bonus configurabile din admin.
 *
 * Tipuri suportate:
 *   PLAY_N_TIMES  – Joacă de N ori (indiferent de rezultat) → +X pts
 *   WIN_N_TIMES   – Câștigă N meciuri → +X pts
 *   WIN_STREAK    – N victorii consecutive → +X pts
 *   SCORE_N_POINTS – Acumulează N puncte total (suma scorurilor) → +X pts
 *
 * Fiecare jucător poate obține bonus-ul O singură dată per challenge.
 * Se apelează din finalizeMatch după ce statisticile sunt salvate.
 */

import prisma from '../prisma';
import logger from '../logger';

export type ChallengeType = 'PLAY_N_TIMES' | 'WIN_N_TIMES' | 'WIN_STREAK' | 'SCORE_N_POINTS';

export interface ChallengeDef {
  type: ChallengeType;
  label: string;
  descriptionTemplate: (required: number, bonus: number) => string;
  icon: string;
}

export const CHALLENGE_TYPE_DEFS: Record<ChallengeType, ChallengeDef> = {
  PLAY_N_TIMES: {
    type: 'PLAY_N_TIMES',
    label: 'Joacă de N ori',
    descriptionTemplate: (n, pts) =>
      `Joacă de ${n} ori (indiferent de rezultat) → +${pts} pts`,
    icon: '🎮',
  },
  WIN_N_TIMES: {
    type: 'WIN_N_TIMES',
    label: 'Câștigă N meciuri',
    descriptionTemplate: (n, pts) => `Câștigă ${n} meciuri → +${pts} pts`,
    icon: '🏆',
  },
  WIN_STREAK: {
    type: 'WIN_STREAK',
    label: 'N victorii consecutive',
    descriptionTemplate: (n, pts) => `${n} victorii la rând → +${pts} pts bonus`,
    icon: '🔥',
  },
  SCORE_N_POINTS: {
    type: 'SCORE_N_POINTS',
    label: 'Acumulează N puncte',
    descriptionTemplate: (n, pts) =>
      `Acumulează ${n} puncte total (suma scorurilor) → +${pts} pts bonus`,
    icon: '⭐',
  },
};

export function challengeDescription(type: ChallengeType, required: number, bonus: number): string {
  return CHALLENGE_TYPE_DEFS[type]?.descriptionTemplate(required, bonus) ?? type;
}

/**
 * Evaluează și acordă challengele active după terminarea unui meci.
 * Apelat pentru fiecare jucător REAL din meci.
 */
export async function evaluateChallengesForUser(params: {
  userId: string;
  gameType: string;
  position: number;      // 1 = câștigător
  totalPlayers: number;
  score: number;
}) {
  const { userId, gameType, position, score } = params;
  const normalizedGame = gameType === 'maze' ? 'labirinturi' : gameType;

  // Găsim challengele active pentru acest joc SAU globale (*), neacordate încă
  const challenges = await prisma.bonusChallenge.findMany({
    where: {
      isActive: true,
      gameType: { in: [normalizedGame, '*'] },
      awards: { none: { userId } }, // jucătorul nu l-a primit încă
    },
  });

  if (challenges.length === 0) return;

  // Statisticile jucătorului pentru acest joc (toate nivelele sumate)
  const stats = await prisma.userGameStats.findMany({
    where: { userId, gameType: normalizedGame },
  });

  const totalMatches = stats.reduce((s, r) => s + r.totalMatches, 0);
  const totalWins    = stats.reduce((s, r) => s + r.wins, 0);
  const totalScore   = stats.reduce((s, r) => s + r.totalScore, 0);
  // currentStreak: luăm maximul din toate nivelele (aproximare)
  const currentStreak = Math.max(0, ...stats.map((r) => r.currentStreak));

  const bonusToAdd: { challengeId: string; points: number }[] = [];

  for (const ch of challenges) {
    let met = false;
    switch (ch.challengeType as ChallengeType) {
      case 'PLAY_N_TIMES':
        met = totalMatches >= ch.requiredValue;
        break;
      case 'WIN_N_TIMES':
        met = totalWins >= ch.requiredValue;
        break;
      case 'WIN_STREAK':
        met = currentStreak >= ch.requiredValue;
        break;
      case 'SCORE_N_POINTS':
        // Punctele din meciul curent sunt deja incluse în stats (upsert e înainte)
        met = totalScore >= ch.requiredValue;
        break;
    }

    if (met) {
      bonusToAdd.push({ challengeId: ch.id, points: ch.bonusPoints });
    }
  }

  if (bonusToAdd.length === 0) return;

  // Acordăm bonus-urile în paralel
  await Promise.all(
    bonusToAdd.map(async ({ challengeId, points }) => {
      try {
        // Creăm award-ul (unique constraint previne dubla acordare)
        await prisma.bonusChallengeAward.create({
          data: { userId, bonusChallengeId: challengeId, awardedPoints: points },
        });
        // Adaugăm punctele la scorul/XP-ul jucătorului
        await prisma.user.update({
          where: { id: userId },
          data: { xp: { increment: points } },
        });
        logger.info('BonusChallenge awarded', { userId, challengeId, points });
      } catch {
        // unique constraint = deja acordat (race condition), ignorăm
      }
    })
  );
}
