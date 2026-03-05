/**
 * Tracks Labirinturi solo game completion.
 * Stored in localStorage under key "maze_solo_progress".
 * Format: Set of strings like "1-0", "1-1", ..., "5-3" (level-gameIndex).
 */

import { statsApi } from '@/lib/api';

const STORAGE_KEY = 'maze_solo_progress';
export const MAZE_GAMES_PER_LEVEL = 4;

function key(level: number, gameIndex: number): string {
  return `${level}-${gameIndex}`;
}

function load(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function save(completed: Set<string>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
}

export function markMazeLevelCompleted(level: number, gameIndex: number) {
  const completed = load();
  completed.add(key(level, gameIndex));
  save(completed);
}

export function isMazeLevelCompleted(level: number, gameIndex: number): boolean {
  return load().has(key(level, gameIndex));
}

export function isMazeLevelUnlocked(level: number): boolean {
  if (level <= 1) return true;
  return isMazeLevelCompleted(level - 1, MAZE_GAMES_PER_LEVEL - 1);
}

export function isMazeGameUnlocked(level: number, gameIndex: number): boolean {
  if (level === 1 && gameIndex === 0) return true;
  if (gameIndex > 0) return isMazeLevelCompleted(level, gameIndex - 1);
  return isMazeLevelCompleted(level - 1, MAZE_GAMES_PER_LEVEL - 1);
}

export function getCompletedMazeLevels(): Set<string> {
  return load();
}

export async function hydrateMazeProgressFromServer(): Promise<Set<string>> {
  const local = load();

  try {
    const { data } = await statsApi.getMazeSoloProgress();
    const fromServer = Array.isArray(data?.completedLevels)
      ? (data.completedLevels as number[])
      : [];

    const merged = new Set<string>(local);

    for (const existingKey of local) {
      if (/^\d+$/.test(existingKey)) {
        const legacyLevel = Number(existingKey);
        if (Number.isFinite(legacyLevel)) {
          merged.add(key(legacyLevel, MAZE_GAMES_PER_LEVEL - 1));
          merged.delete(existingKey);
        }
      }
    }

    for (const level of fromServer) {
      if (typeof level === 'number' && Number.isFinite(level)) {
        merged.add(key(level, MAZE_GAMES_PER_LEVEL - 1));
      }
    }

    save(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function syncMazeLevelCompletion(level: number, gameIndex: number, score = 0): Promise<void> {
  markMazeLevelCompleted(level, gameIndex);

  try {
    const completed = load();
    const allLevelGamesCompleted = Array.from({ length: MAZE_GAMES_PER_LEVEL }, (_v, index) =>
      completed.has(key(level, index))
    ).every(Boolean);

    if (allLevelGamesCompleted) {
      await statsApi.completeMazeSoloLevel(level, score);
    }
  } catch {
    // fallback local only
  }
}
