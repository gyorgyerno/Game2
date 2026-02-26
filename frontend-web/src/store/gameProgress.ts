/**
 * Tracks which integrame solo games the user has completed.
 * Stored in localStorage under key "integrame_progress".
 * Format: Set of strings like "1-0", "1-1", "2-0" (level-gameIndex).
 */

const STORAGE_KEY = 'integrame_progress';

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
  completed.add(`${level}-${gameIndex}`);
  save(completed);
}

/** Check if a specific game is completed. */
export function isCompleted(level: number, gameIndex: number): boolean {
  return load().has(`${level}-${gameIndex}`);
}

/**
 * Check if a game is unlocked (can be played).
 * Rules:
 *  - Level 1, Game 0 → always unlocked
 *  - Any other game → previous game must be completed
 */
export function isUnlocked(level: number, gameIndex: number): boolean {
  if (level === 1 && gameIndex === 0) return true;
  if (gameIndex > 0) return isCompleted(level, gameIndex - 1);
  // gameIndex === 0 and level > 1
  return isCompleted(level - 1, 2);
}

/** Get all completed game keys. */
export function getCompleted(): Set<string> {
  return load();
}
