import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Global error interceptor ─────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status ?? 0;
    const url   = error.config?.url ?? '';
    const method = (error.config?.method ?? 'GET').toUpperCase();
    const detail = (error.response?.data as Record<string, unknown>)?.error ?? error.message;

    // Auto-logout on 401
    if (status === 401) {
      await SecureStore.deleteItemAsync('token').catch(() => {});
    }

    // Log to Metro console (visible in Expo dev tools)
    console.error(`[API] ${method} ${url} → ${status}`, detail);

    // Send to backend log endpoint (best-effort)
    api.post('/logs/client', {
      type: 'axios-error',
      method,
      url,
      status,
      message: String(detail),
      platform: 'mobile',
      ts: new Date().toISOString(),
    }).catch(() => {});

    return Promise.reject(error);
  }
);

export const usersApi = {
  getMe: () => api.get('/users/me'),
  getProfile: (username: string) => api.get(`/users/${username}`),
  updateProfile: (data: Record<string, unknown>) => api.put('/users/me', data),
  getFriends: () => api.get('/users/me/friends'),
};

export const authApi = {
  sendOtp: (email: string) => api.post('/auth/send-otp', { email }),
  login: (email: string, otp: string) => api.post('/auth/login', { email, otp }),
  register: (email: string, username: string, otp: string, ref?: string) =>
    api.post('/auth/register', { email, username, otp, referralCode: ref }),
};

export const matchesApi = {
  findOrCreate: (gameType: string, level: number) =>
    api.post('/matches/find-or-create', { gameType, level }),
  getMatch: (id: string) => api.get(`/matches/${id}`),
  getHistory: () => api.get('/matches/history/me'),
};

export const leaderboardApi = {
  get: (params?: Record<string, unknown>) => api.get('/leaderboard', { params }),
};

export const invitesApi = {
  create: (d: { gameType: string; level: number; matchId?: string }) => api.post('/invites', d),
  get: (code: string) => api.get(`/invites/${code}`),
  accept: (code: string) => api.post(`/invites/${code}/accept`),
};

export const statsApi = {
  getMyStats: (gameType?: string, level?: number) =>
    api.get('/stats/me', { params: { gameType, level } }),
};
