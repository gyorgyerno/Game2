/**
 * Tracks which integrame solo games the user has completed.
 * Stored in localStorage under key "integrame_progress".
 * Format: Set of strings like "1-0", "1-1", "2-0" (level-gameIndex).
 */

import { statsApi } from '@/lib/api';

const STORAGE_KEY = 'integrame_progress';

function key(level: number, gameIndex: number): string {
  return `${level}-${gameIndex}`;
}

function hasAuthToken(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem('token');
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

/** Mark a game as completed and persist. */
export function markCompleted(level: number, gameIndex: number) {
  const completed = load();
  completed.add(key(level, gameIndex));
  save(completed);
}

/** Check if a specific game is completed. */
export function isCompleted(level: number, gameIndex: number): boolean {
  return load().has(key(level, gameIndex));
}

/**
 * Check if a game is unlocked (can be played).
 * Rules:
 *  - Level 1, Game 0 → always unlocked
 *  - Any other game → previous game must be completed
 * @param prevLevelGames  number of games in the previous level (default 3)
 */
export function isUnlocked(level: number, gameIndex: number, prevLevelGames = 3): boolean {
  if (level === 1 && gameIndex === 0) return true;
  if (gameIndex > 0) return isCompleted(level, gameIndex - 1);
  // gameIndex === 0 and level > 1
  return isCompleted(level - 1, prevLevelGames - 1);
}

/** Get all completed game keys. */
export function getCompleted(): Set<string> {
  return load();
}

export async function hydrateIntegrameProgressFromServer(): Promise<Set<string>> {
  const local = load();
  if (!hasAuthToken()) return local;

  try {
    const { data } = await statsApi.getIntegrameSoloProgress();
    const serverGames = Array.isArray(data?.completedGames)
      ? (data.completedGames as Array<{ level?: number; gameIndex?: number }>)
      : [];

    const merged = new Set<string>(local);
    for (const entry of serverGames) {
      if (typeof entry.level === 'number' && typeof entry.gameIndex === 'number') {
        merged.add(key(entry.level, entry.gameIndex));
      }
    }

    save(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function syncIntegrameGameCompletion(level: number, gameIndex: number): Promise<void> {
  markCompleted(level, gameIndex);
  if (!hasAuthToken()) return;

  try {
    await statsApi.completeIntegrameSoloGame(level, gameIndex);
  } catch {
    // fallback local only
  }
}
