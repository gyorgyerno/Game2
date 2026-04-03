// ─── Player skill profile update după finalizarea unui meci ──────────────────
import prisma from '../prisma';

function safeJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function movingAverage(current: number, next: number, samples: number): number {
  if (samples <= 0) return next;
  return (current * samples + next) / (samples + 1);
}

export async function updatePlayerSkillProfileForMatch(params: {
  userId: string;
  gameType: string;
  totalPlayers: number;
  position: number;
  correctAnswers: number;
  mistakes: number;
  completionTimeSec: number;
}): Promise<void> {
  const { userId, gameType, totalPlayers, position, correctAnswers, mistakes, completionTimeSec } = params;

  const existingProfile = await prisma.playerSkillProfile.findUnique({ where: { userId } });

  const historicalMatches = await prisma.userGameStats.aggregate({
    where: { userId },
    _sum: { totalMatches: true, wins: true, losses: true },
  });

  const sampleCount = historicalMatches._sum.totalMatches ?? 0;
  const historicalWins = historicalMatches._sum.wins ?? 0;
  const historicalLosses = historicalMatches._sum.losses ?? 0;

  const attempts = Math.max(1, correctAnswers + mistakes);
  const currentMistakeRate = mistakes / attempts;
  const currentSuccessRate = correctAnswers / attempts;

  const rankSuccess = totalPlayers <= 1
    ? 1
    : Math.max(0, 1 - (position - 1) / Math.max(1, totalPlayers - 1));

  const preferred = new Set<string>(safeJsonArray(existingProfile?.preferredGameTypes));
  preferred.add(gameType);

  const updatedAverageCompletion = movingAverage(
    existingProfile?.averageCompletionTime ?? 0,
    completionTimeSec,
    sampleCount,
  );

  const updatedMistakeRate = movingAverage(
    existingProfile?.mistakeRate ?? 0,
    currentMistakeRate,
    sampleCount,
  );

  const updatedSuccessRate = movingAverage(
    existingProfile?.successRate ?? 0,
    currentSuccessRate,
    sampleCount,
  );

  const updatedHintUsageRate = existingProfile?.hintUsageRate ?? 0;
  const updatedCorrectionRate = existingProfile?.correctionRate ?? 0;
  const updatedPathEfficiency = movingAverage(
    existingProfile?.pathEfficiency ?? 0,
    rankSuccess,
    sampleCount,
  );

  const isWin = position === 1;
  const isLoss = position === totalPlayers;
  const totalWins = historicalWins + (isWin ? 1 : 0);
  const totalLosses = historicalLosses + (isLoss ? 1 : 0);
  const winLossRatio = totalWins / Math.max(1, totalLosses);

  await prisma.playerSkillProfile.upsert({
    where: { userId },
    update: {
      averageCompletionTime: Number(updatedAverageCompletion.toFixed(3)),
      mistakeRate: Number(updatedMistakeRate.toFixed(4)),
      successRate: Number(updatedSuccessRate.toFixed(4)),
      preferredGameTypes: JSON.stringify(Array.from(preferred)),
      winLossRatio: Number(winLossRatio.toFixed(4)),
      hintUsageRate: Number(updatedHintUsageRate.toFixed(4)),
      correctionRate: Number(updatedCorrectionRate.toFixed(4)),
      pathEfficiency: Number(updatedPathEfficiency.toFixed(4)),
    },
    create: {
      userId,
      averageCompletionTime: Number(completionTimeSec.toFixed(3)),
      mistakeRate: Number(currentMistakeRate.toFixed(4)),
      successRate: Number(currentSuccessRate.toFixed(4)),
      preferredGameTypes: JSON.stringify([gameType]),
      winLossRatio: Number((isWin ? 1 : 0).toFixed(4)),
      hintUsageRate: 0,
      correctionRate: 0,
      pathEfficiency: Number(rankSuccess.toFixed(4)),
    },
  });
}
