// ─── Input sanitization & score normalization ─────────────────────────────────
// Pure functions — fără dependențe externe, testabile izolat

export type LegacyProgressPayload = {
  matchId: string;
  correctAnswers: number;
  mistakes: number;
};

export type GenericProgressPayload = {
  matchId: string;
  metrics?: Record<string, unknown>;
  correctAnswers?: number;
  mistakes?: number;
};

export function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function isMazeGame(gameType: string): boolean {
  return gameType === 'maze' || gameType === 'labirinturi';
}

/** Canonicalizează gameType-ul la forma folosită în DB (ex: 'labirinturi' → 'maze') */
export function normalizeGameType(gameType: string): string {
  if (gameType === 'labirinturi') return 'maze';
  return gameType;
}

/** Hash deterministă din matchId → seed uint32.
 *  Același matchId produce mereu același seed → ambii jucători generează același labirint. */
export function mazeSeedFromMatchId(matchId: string): number {
  let h = 0x12345678;
  for (let i = 0; i < matchId.length; i++) {
    h = (Math.imul(h, 31) + matchId.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function sanitizeMetrics(metrics: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(metrics).slice(0, 20);
  const safe: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = clampInteger(value, 0, 10000);
      continue;
    }
    if (typeof value === 'boolean') {
      safe[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      safe[key] = value.slice(0, 64);
    }
  }

  return safe;
}

function sanitizeMazeInput(
  metrics: Record<string, unknown>,
  startedAt: Date | null,
  payloadCorrect?: number,
  payloadMistakes?: number,
) {
  const elapsedSec = startedAt
    ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
    : 0;

  const maxStepsByTime = Math.max(25, elapsedSec * 8 + 40);
  const maxWallHitsByTime = Math.max(10, elapsedSec * 6 + 20);
  const maxBonuses = 30;

  const rawSteps = toFiniteNumber(metrics.steps) ?? toFiniteNumber(metrics.progressPoints) ?? 0;
  const rawWallHits = toFiniteNumber(metrics.wallHits) ?? 0;
  const rawBonuses = toFiniteNumber(metrics.bonusesCollected) ?? 0;
  const rawProgressPercent = toFiniteNumber(metrics.progressPercent) ?? 0;

  const steps = clampInteger(rawSteps, 0, maxStepsByTime);
  const wallHits = clampInteger(rawWallHits, 0, maxWallHitsByTime);
  const bonusesCollected = clampInteger(rawBonuses, 0, maxBonuses);
  const progressPercent = clampInteger(rawProgressPercent, 0, 100);

  const computedCorrect = clampInteger(steps + bonusesCollected * 4, 0, maxStepsByTime + maxBonuses * 4);
  const computedMistakes = wallHits;

  const correctAnswers = clampInteger(
    payloadCorrect ?? computedCorrect,
    0,
    maxStepsByTime + maxBonuses * 4,
  );

  const mistakes = clampInteger(
    payloadMistakes ?? computedMistakes,
    0,
    maxWallHitsByTime,
  );

  const normalizedMetrics: Record<string, unknown> = {
    steps,
    wallHits,
    bonusesCollected,
    progressPercent,
  };

  if (typeof metrics.usedCheckpoint === 'boolean') {
    normalizedMetrics.usedCheckpoint = metrics.usedCheckpoint;
  }

  const suspicious =
    rawSteps > maxStepsByTime ||
    rawWallHits > maxWallHitsByTime ||
    rawBonuses > maxBonuses ||
    rawProgressPercent > 100;

  return { correctAnswers, mistakes, metrics: normalizedMetrics, suspicious };
}

export function normalizeScoreInput(
  payload: GenericProgressPayload | LegacyProgressPayload,
  gameType: string,
  startedAt: Date | null,
) {
  const rawMetrics = 'metrics' in payload && payload.metrics ? payload.metrics : {};
  const payloadCorrect = toFiniteNumber(payload.correctAnswers);
  const payloadMistakes = toFiniteNumber(payload.mistakes);

  if (isMazeGame(gameType)) {
    return sanitizeMazeInput(rawMetrics, startedAt, payloadCorrect, payloadMistakes);
  }

  const metrics = sanitizeMetrics(rawMetrics);

  const metricsCorrect =
    toFiniteNumber(metrics.correctAnswers) ??
    toFiniteNumber(metrics.progressPoints) ??
    toFiniteNumber(metrics.steps);

  const metricsMistakes =
    toFiniteNumber(metrics.mistakes) ??
    toFiniteNumber(metrics.wallHits);

  const correctAnswers = clampInteger(payloadCorrect ?? metricsCorrect ?? 0, 0, 10000);
  const mistakes = clampInteger(payloadMistakes ?? metricsMistakes ?? 0, 0, 10000);

  return { correctAnswers, mistakes, metrics, suspicious: false };
}
