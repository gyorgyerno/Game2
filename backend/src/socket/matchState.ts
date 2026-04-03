// ─── Shared mutable state pentru toate match handlers ────────────────────────
// Singleton module — un singur set de Maps/Sets per proces Node.js

export const countdownTimers: Record<string, ReturnType<typeof setInterval>> = {};
export const matchTimers: Record<string, ReturnType<typeof setTimeout>> = {};

// Previne pornirea multiplă a countdown-ului pentru același meci
export const countdownStarted: Set<string> = new Set();

// Tracker socket.id → matchId (pentru detectare disconnect)
export const socketMatchMap: Map<string, string> = new Map();

// Rate limiter state per socket
export const progressRateState: Map<string, { windowStart: number; count: number }> = new Map();

// Grace period la disconnect: userId_matchId → timer handle
// Dacă userul se reconectează în 12s, timer-ul e anulat și meciul continuă
export const reconnectGraceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

export const RECONNECT_GRACE_MS = 12_000;

const PROGRESS_RATE_WINDOW_MS = 1000;
const PROGRESS_RATE_MAX_PER_WINDOW = 10;

export function isProgressRateLimited(socketId: string): boolean {
  const now = Date.now();
  const current = progressRateState.get(socketId);

  if (!current || now - current.windowStart >= PROGRESS_RATE_WINDOW_MS) {
    progressRateState.set(socketId, { windowStart: now, count: 1 });
    return false;
  }

  if (current.count >= PROGRESS_RATE_MAX_PER_WINDOW) {
    return true;
  }

  current.count += 1;
  progressRateState.set(socketId, current);
  return false;
}

// Curăță state-ul unui socket la disconnect/leave
export function cleanupSocketState(socketId: string): void {
  socketMatchMap.delete(socketId);
  progressRateState.delete(socketId);
}
