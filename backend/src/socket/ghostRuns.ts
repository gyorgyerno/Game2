// ─── Ghost run buffer & capture ───────────────────────────────────────────────
import prisma from '../prisma';
import { config } from '../config';

type GhostEvent = {
  action: string;
  time: number;
  score?: number;
  correctAnswers?: number;
  mistakes?: number;
  wallHits?: number;
};

export const ghostEventBuffers: Map<string, Array<GhostEvent>> = new Map();

export const MAX_GHOST_EVENTS_PER_PLAYER = 300;

export function ghostBufferKey(matchId: string, userId: string): string {
  return `${matchId}:${userId}`;
}

export function pushGhostEvent(
  matchId: string,
  userId: string,
  action: string,
  startedAt: Date | null,
  payload?: { score?: number; correctAnswers?: number; mistakes?: number; wallHits?: number },
): void {
  if (!config.features.ghostPlayersEnabled) return;

  const key = ghostBufferKey(matchId, userId);
  const now = Date.now();
  const relativeSec = startedAt
    ? Number(((now - startedAt.getTime()) / 1000).toFixed(2))
    : 0;

  const current = ghostEventBuffers.get(key) ?? [];
  current.push({
    action,
    time: Math.max(0, relativeSec),
    score: payload?.score,
    correctAnswers: payload?.correctAnswers,
    mistakes: payload?.mistakes,
    wallHits: payload?.wallHits,
  });

  if (current.length > MAX_GHOST_EVENTS_PER_PLAYER) {
    current.splice(0, current.length - MAX_GHOST_EVENTS_PER_PLAYER);
  }

  ghostEventBuffers.set(key, current);
}

export function clearGhostBuffersForMatch(matchId: string, userIds: string[]): void {
  for (const id of userIds) {
    ghostEventBuffers.delete(ghostBufferKey(matchId, id));
  }
}

export async function captureGhostRuns(match: any): Promise<void> {
  if (!config.features.ghostPlayersEnabled) return;
  if (!match) return;

  const startedMs = match.startedAt ? new Date(match.startedAt).getTime() : Date.now();

  for (const player of match.players as Array<any>) {
    if (player.user?.userType !== 'REAL') continue;

    const key = ghostBufferKey(match.id, player.userId);
    const buffered = ghostEventBuffers.get(key) ?? [];

    const events: GhostEvent[] = buffered.length > 0
      ? buffered
      : [{ action: 'finish', time: 0, score: player.score, correctAnswers: player.correctAnswers, mistakes: player.mistakes, wallHits: undefined }];

    const completionTimeSec = player.finishedAt
      ? Math.max(0, Number(((new Date(player.finishedAt).getTime() - startedMs) / 1000).toFixed(2)))
      : 0;

    // Prefer actual wallHits from the finish event (recorded regardless of penalty level)
    const finishEvent = events.slice().reverse().find((e) => e.action === 'finish');
    const actualWallHits = typeof finishEvent?.wallHits === 'number'
      ? finishEvent.wallHits
      : player.mistakes ?? 0;

    await prisma.ghostRun.create({
      data: {
        playerId: player.userId,
        gameType: match.gameType,
        difficulty: match.level,
        moves: JSON.stringify(events.map((e) => ({
          action: e.action,
          time: e.time,
          score: e.score,
          correctAnswers: e.correctAnswers,
          mistakes: e.mistakes,
        }))),
        timestamps: JSON.stringify(events.map((e) => e.time)),
        mistakes: actualWallHits,
        corrections: 0,
        completionTime: completionTimeSec,
        finalScore: player.score ?? 0,
      },
    });
  }

  clearGhostBuffersForMatch(match.id, match.players.map((p: any) => p.userId));
}
