// ─── User & Auth ──────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  rating: number;
  xp: number;
  league: League;
  createdAt: string;
}

export type League = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface AuthOTPRequest {
  email: string;
}
export interface AuthOTPVerify {
  email: string;
  otp: string;
}
export interface AuthRegisterRequest {
  email: string;
  username: string;
  otp: string;
  referralCode?: string;
}
export interface AuthResponse {
  token: string;
  user: User;
}

// ─── Game Types ───────────────────────────────────────────────────────────────
export type GameType = 'integrame' | 'labirinturi' | 'maze' | 'slogane' | string;

export interface GameTypeConfig {
  id: GameType;
  name: string;
  description: string;
  iconUrl?: string;
  levels: GameLevel[];
  rules: GameRules;
}

export type GameLevel = 1 | 2 | 3 | 4 | 5;

export const MAX_PLAYERS_PER_LEVEL: Record<GameLevel, number> = {
  1: 2,
  2: 4,
  3: 8,
  4: 12,
  5: 20,
};

// ─── Game Rules ───────────────────────────────────────────────────────────────
export interface GameRules {
  pointsPerCorrect: number;
  pointsPerMistake: number;
  bonusFirstFinisher: number;
  bonusFinalizare: number;
  timeLimit: number; // seconds
}

export const GAME_RULES: Record<GameType, GameRules> = {
  integrame: {
    pointsPerCorrect: 10,
    pointsPerMistake: -5,
    bonusFirstFinisher: 10,
    bonusFinalizare: 20,
    timeLimit: 180,
  },
  labirinturi: {
    pointsPerCorrect: 5,
    pointsPerMistake: -3,
    bonusFirstFinisher: 50,
    bonusFinalizare: 0,
    timeLimit: 60,
  },
  maze: {
    pointsPerCorrect: 5,
    pointsPerMistake: -3,
    bonusFirstFinisher: 50,
    bonusFinalizare: 0,
    timeLimit: 60,
  },
  slogane: {
    pointsPerCorrect: 15,
    pointsPerMistake: -5,
    bonusFirstFinisher: 20,
    bonusFinalizare: 25,
    timeLimit: 120,
  },
};

// ─── Match ────────────────────────────────────────────────────────────────────
export type MatchStatus = 'waiting' | 'countdown' | 'active' | 'finished' | 'abandoned';

export interface Match {
  id: string;
  gameType: GameType;
  level: GameLevel;
  status: MatchStatus;
  players: MatchPlayer[];
  startedAt?: string;
  finishedAt?: string;
  inviteCode?: string;
}

export interface MatchPlayer {
  userId: string;
  username: string;
  avatarUrl?: string;
  score: number;
  xpGained: number;
  eloChange: number;
  correctAnswers: number;
  mistakes: number;
  finishedAt?: string;
  position?: number;
  bonuses: PlayerBonuses;
}

export interface PlayerBonuses {
  firstFinisher: boolean;
  finalizare: boolean;
}

// ─── Score Calculation ────────────────────────────────────────────────────────
export interface ScoreInput {
  correctAnswers: number;
  mistakes: number;
  isFirstFinisher: boolean;
  hasFinished: boolean;
  rules: GameRules;
}

export function calculateScore(input: ScoreInput): number {
  const { correctAnswers, mistakes, isFirstFinisher, hasFinished, rules } = input;
  let score = correctAnswers * rules.pointsPerCorrect + mistakes * rules.pointsPerMistake;
  if (isFirstFinisher) score += rules.bonusFirstFinisher;
  if (hasFinished) score += rules.bonusFinalizare;
  return Math.max(0, score);
}

// ─── XP & ELO ─────────────────────────────────────────────────────────────────
export const XP_PER_WIN = 50;
export const XP_PER_LOSS = 10;
export const XP_PER_DRAW = 25;
export const XP_BONUS_TOP3 = 20;
export const XP_LEVEL_MULTIPLIER = 1.2;

export function calculateXPGained(position: number, totalPlayers: number): number {
  if (position === 1) return XP_PER_WIN + XP_BONUS_TOP3 * 2;
  if (position <= 3) return XP_PER_WIN + XP_BONUS_TOP3;
  if (position <= Math.ceil(totalPlayers / 2)) return XP_PER_DRAW;
  return XP_PER_LOSS;
}

/** Elo K-factor based on current rating */
export function eloKFactor(rating: number): number {
  if (rating < 1200) return 32;
  if (rating < 1600) return 24;
  return 16;
}

/** Expected score between two players */
export function eloExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Calculate new ELO after a match */
export function calculateELO(
  playerRating: number,
  opponentRatings: number[],
  position: number,
  totalPlayers: number
): number {
  const avgOpponentRating = opponentRatings.reduce((a, b) => a + b, 0) / opponentRatings.length;
  const expected = eloExpected(playerRating, avgOpponentRating);
  const actualScore = 1 - (position - 1) / (totalPlayers - 1 || 1);
  const k = eloKFactor(playerRating);
  return Math.round(playerRating + k * (actualScore - expected));
}

export function ratingToLeague(rating: number): League {
  if (rating < 1200) return 'bronze';
  if (rating < 1400) return 'silver';
  if (rating < 1600) return 'gold';
  if (rating < 1800) return 'platinum';
  return 'diamond';
}

// ─── Socket Events ────────────────────────────────────────────────────────────
export const SOCKET_EVENTS = {
  // Client → Server
  JOIN_MATCH: 'join_match',
  LEAVE_MATCH: 'leave_match',
  PLAYER_PROGRESS: 'player_progress',
  PLAYER_FINISH: 'player_finish',
  SEND_REACTION: 'send_reaction',

  // Server → Client
  MATCH_STATE: 'match_state',
  MATCH_COUNTDOWN: 'match_countdown',
  MATCH_START: 'match_start',
  MATCH_PROGRESS_UPDATE: 'match_progress_update',
  MATCH_FINISHED: 'match_finished',
  OPPONENT_LEFT: 'opponent_left',
  LEADERBOARD_UPDATE: 'leaderboard_update',
  REACTION_RECEIVED: 'reaction_received',
  ERROR: 'error',
} as const;

export interface SocketJoinMatch {
  matchId: string;
  token: string;
}
export interface SocketPlayerProgress {
  matchId: string;
  correctAnswers?: number;
  mistakes?: number;
  metrics?: Record<string, unknown>;
}
export interface SocketPlayerFinish {
  matchId: string;
  correctAnswers?: number;
  mistakes?: number;
  metrics?: Record<string, unknown>;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  rating: number;
  xp: number;
  wins: number;
  winRate: number;
  league: League;
}

// ─── Invite ───────────────────────────────────────────────────────────────────
export interface Invite {
  id: string;
  code: string;
  matchId: string;
  createdBy: string;
  expiresAt: string;
  usedBy: string[];
  maxUses: number;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export interface UserGameStats {
  userId: string;
  gameType: GameType;
  level: GameLevel;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  totalScore: number;
  bestScore: number;
  avgScore: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  eloHistory: EloHistoryEntry[];
}

export interface EloHistoryEntry {
  date: string;
  rating: number;
}

// ─── Contest ──────────────────────────────────────────────────────────────────
export type ContestStatus = 'waiting' | 'live' | 'ended';
export type ContestType = 'public' | 'private';

export interface ContestRoundPublic {
  id: string;
  order: number;
  label: string;
  gameType: string;
  minLevel: number;
  matchesCount: number;
}

export interface ContestPublic {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: ContestType;
  status: ContestStatus;
  startAt: string;
  endAt: string;
  maxPlayers: number | null;
  registeredCount: number;
  onlineCount: number;
  rounds: ContestRoundPublic[];
  isRegistered: boolean;
  isFull: boolean;
}

export interface ContestRoundScore {
  roundId: string;
  order: number;
  label: string;
  gameType: string;
  minLevel: number;
  matchesCount: number;
  score: number;
}

export interface ContestLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalScore: number;
  rounds: ContestRoundScore[];
  matchesPlayed: number;
  joinedAt: string;
}

// Socket events pentru concursuri (Client ↔ Server)
export interface ContestRoomJoin { contestId: string; }
export interface ContestRoomLeave { contestId: string; }
export interface ContestStatusChange { contestId: string; status: ContestStatus; }
export interface ContestLeaderboardUpdate { contestId: string; leaderboard: ContestLeaderboardEntry[]; }
export interface ContestPlayersUpdate { contestId: string; onlinePlayers: string[]; }
