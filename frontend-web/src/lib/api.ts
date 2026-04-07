import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000, // 10 secunde – dacă backend-ul nu răspunde, eroare rapidă
});

// Attach auth token automatically
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Global error interceptor ─────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status ?? 0;
    const url = error.config?.url ?? '';
    const method = (error.config?.method ?? 'GET').toUpperCase();
    const detail = (error.response?.data as Record<string, unknown>)?.error ?? error.message;

    // Auto-logout on 401
    if (status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
    }

    // Log to browser console (visible in DevTools → Console)
    console.error(`[API] ${method} ${url} → ${status}`, detail);

    // Send to backend log endpoint (best-effort, no await)
    if (typeof window !== 'undefined') {
      fetch(`${API_URL}/api/logs/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'axios-error',
          method,
          url,
          status,
          message: String(detail),
          ts: new Date().toISOString(),
        }),
        keepalive: true,
      }).catch(() => {});
    }

    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  sendOtp: (email: string) => api.post('/auth/send-otp', { email }),
  login: (email: string, otp: string) => api.post('/auth/login', { email, otp }),
  register: (email: string, username: string, otp: string, referralCode?: string) =>
    api.post('/auth/register', { email, username, otp, referralCode }),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  getMe: () => api.get('/users/me'),
  getUser: (id: string) => api.get(`/users/${id}`),
  updateMe: (data: { username?: string; avatarUrl?: string }) => api.patch('/users/me', data),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post('/users/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// ─── Matches ──────────────────────────────────────────────────────────────────
const matchesApi = {
  findOrCreate: (gameType: string, level: number, isAI = false) =>
    api.post('/matches/find-or-create', { gameType, level, isAI }),
  getMatch: (id: string) => api.get(`/matches/${id}`),
  getHistory: () => api.get('/matches/history/me'),
  joinMatch: (id: string) => api.post(`/matches/${id}/join`, {}),
  declineRandomMatch: (id: string) => api.post(`/matches/${id}/decline-random`, {}),
};

export { matchesApi };

// ─── Leaderboard ─────────────────────────────────────────────────────────────
export type GlobalLeaderboardEntry = {
  rank: number;
  userId: number;
  username: string;
  avatarUrl: string | null;
  rating: number;
  xp: number;
  wins: number;
  league: string;
  isMe: boolean;
};

export const leaderboardApi = {
  get: (params?: { gameType?: string; level?: number; page?: number }) =>
    api.get('/leaderboard', { params }),
  getGlobal: () =>
    api.get<{ top: GlobalLeaderboardEntry[]; me: GlobalLeaderboardEntry | null }>('/leaderboard/global'),
};

// ─── Invites ─────────────────────────────────────────────────────────────────
export const invitesApi = {
  create: (data: { gameType: string; level: number; matchId?: string; ttlSeconds?: number; isAI?: boolean; aiTheme?: string }) =>
    api.post('/invites', data),
  getActiveByMatch: (matchId: string) => api.get(`/invites/match/${matchId}/active`),
  get: (code: string) => api.get(`/invites/${code}`),
  accept: (code: string, data?: { aiTheme?: string; isAI?: boolean }) => api.post(`/invites/${code}/accept`, data || {}),
};

// ─── Stats ────────────────────────────────────────────────────────────────────
export const statsApi = {
  getMyStats: (gameType?: string, level?: number) =>
    api.get('/stats/me', { params: { gameType, level } }),
  getMyGameRatings: () =>
    api.get('/stats/me/game-ratings'),
  getUserStats: (userId: string, gameType?: string, level?: number) =>
    api.get(`/stats/${userId}`, { params: { gameType, level } }),
  getIntegrameSoloProgress: () =>
    api.get('/stats/solo/integrame'),
  completeIntegrameSoloGame: (level: number, gameIndex: number) =>
    api.post('/stats/solo/integrame/complete', { level, gameIndex }),
  getMazeSoloProgress: () =>
    api.get('/stats/solo/maze'),
  completeMazeSoloLevel: (level: number, score: number) =>
    api.post('/stats/solo/maze/complete', { level, score }),
  getXpHistory: (gameType?: string) =>
    api.get('/stats/xp-history', { params: { gameType } }),
};

// ─── AI ───────────────────────────────────────────────────────────────────────
export const aiApi = {
  generatePuzzle: (matchId?: string, level?: number, theme?: string, elo?: number) =>
    api.post('/ai/generate-puzzle', { matchId, level, theme, elo }),
  getPuzzle: (matchId: string) =>
    api.get(`/ai/puzzle/${matchId}`),
  getThemes: () =>
    api.get('/ai/themes'),
};

// ─── Friends ───────────────────────────────────────────────────────────────
export const friendsApi = {
  sendRequest:    (username: string) => api.post('/friends/request', { username }),
  list:           ()                 => api.get('/friends'),
  online:         (gameType?: string, level?: number) => api.get('/friends/online', { params: { gameType, level } }),
  requests:       ()                 => api.get('/friends/requests'),
  sent:           ()                 => api.get('/friends/sent'),
  accept:         (id: string)       => api.post(`/friends/${id}/accept`),
  remove:         (id: string)       => api.delete(`/friends/${id}`),
};

// ─── Games catalog ───────────────────────────────────────────────────────────
export const gamesApi = {
  getAll:       ()             => api.get('/games'),
  getRules:     (gameType: string) => api.get<{ timeLimit: number; pointsPerCorrect: number; pointsPerMistake: number; bonusCompletion: number; bonusFirstFinisher: number; forfeitBonus: number }>(`/games/rules/${gameType}`),
  getLevels:    (gameType: string) => api.get<Array<{ level: number; displayName: string; gamesPerLevel: number; maxPlayers: number; winsToUnlock: number; difficultyValue: number; aiEnabled?: boolean }>>(`/games/levels/${gameType}`),
  getMazePoolSeed: (level: number) => api.get<{ seed: number | null; shapeVariant?: string; aiEnabled: boolean; poolEmpty?: boolean }>(`/games/maze/pool-seed?level=${level}`),
  getUiConfig:  () => api.get<{ aiAssistantEnabled: boolean }>('/games/ui-config'),
};

// ─── Contests ─────────────────────────────────────────────────────────────────
export const contestsApi = {
  list:         () => api.get('/contests'),
  get:          (slug: string) => api.get(`/contests/${slug}`),
  join:         (slug: string) => api.post(`/contests/${slug}/join`, {}),
  leaderboard:  (slug: string, limit?: number) => api.get(`/contests/${slug}/leaderboard`, { params: { limit } }),
  players:      (slug: string) => api.get(`/contests/${slug}/players`),
};
