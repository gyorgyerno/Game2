import axios from 'axios';

const adminApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
});

adminApi.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

export type BotConfig = {
  id: string;
  enabled: boolean;
  maxBotsOnline: number;
  botScoreLimit: number;
  activityFeedEnabled: boolean;
  chatEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AIProfileRecord = {
  id: string;
  userId: string;
  skillLevel: number;
  thinkingSpeedMsMin: number;
  thinkingSpeedMsMax: number;
  mistakeRate: number;
  hesitationProbability: number;
  correctionProbability: number;
  playStyle: string;
  personality: string;
  preferredGames: string;
  onlineProbability: number;
  chatProbability: number;
  sessionLengthMin: number;
  sessionLengthMax: number;
  activityPattern: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    userType: string;
    rating: number;
    xp: number;
    league: string;
  };
};

export type GhostRunRecord = {
  id: string;
  playerId: string;
  gameType: string;
  difficulty: number;
  moves: string;
  timestamps: string;
  mistakes: number;
  corrections: number;
  completionTime: number;
  finalScore: number;
  createdAt: string;
  player: {
    id: string;
    username: string;
    email: string;
    userType: string;
    rating: number;
    xp: number;
    league: string;
  };
};

export type SimulatedPlayersHealth = {
  features: {
    simPlayersEnabled: boolean;
    ghostPlayersEnabled: boolean;
    botChatEnabled: boolean;
    botActivityFeedEnabled: boolean;
  };
  botConfig: BotConfig | null;
  counters: {
    simulatedUsers: number;
    enabledProfiles: number;
    waitingMatchesWithBots: number;
  };
  orchestrator: {
    scheduledMatches: number;
    totalScheduled: number;
    totalJoined: number;
    totalSkipped: number;
    lastSkipReason?: string;
    lastActionAt?: string;
    lastDifficultyMode?: string;
  };
};

export const getSimulatedPlayersConfig = async () => {
  const { data } = await adminApi.get<{ botConfig: BotConfig }>('/api/admin/simulated-players/config');
  return data.botConfig;
};

export const patchSimulatedPlayersConfig = async (payload: Partial<{
  enabled: boolean;
  maxBotsOnline: number;
  botScoreLimit: number;
  activityFeedEnabled: boolean;
  chatEnabled: boolean;
}>) => {
  const { data } = await adminApi.patch<{ botConfig: BotConfig }>('/api/admin/simulated-players/config', payload);
  return data.botConfig;
};

export const getSimulatedPlayersHealth = async () => {
  const { data } = await adminApi.get<SimulatedPlayersHealth>('/api/admin/simulated-players/health');
  return data;
};

export const listSimulatedPlayerProfiles = async (params: { page?: number; limit?: number; search?: string }) => {
  const { data } = await adminApi.get<{
    profiles: AIProfileRecord[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>('/api/admin/simulated-players/profiles', { params });
  return data;
};

export const createSimulatedPlayerProfile = async (payload: {
  username: string;
  email?: string;
  avatarUrl?: string;
  skillLevel?: number;
  personality?: string;
  preferredGames?: string[];
  enabled?: boolean;
}) => {
  const { data } = await adminApi.post<{ profile: unknown }>('/api/admin/simulated-players/profiles', payload);
  return data.profile;
};

export const patchSimulatedPlayerProfile = async (
  userId: string,
  payload: Partial<{
    username: string;
    avatarUrl: string | null;
    skillLevel: number;
    thinkingSpeedMsMin: number;
    thinkingSpeedMsMax: number;
    mistakeRate: number;
    hesitationProbability: number;
    correctionProbability: number;
    personality: string;
    preferredGames: string[];
    enabled: boolean;
  }>
) => {
  const { data } = await adminApi.patch<{ user: unknown; profile: unknown }>(`/api/admin/simulated-players/profiles/${userId}`, payload);
  return data;
};

export const listGhostRuns = async (params: { page?: number; limit?: number; search?: string; gameType?: string }) => {
  const { data } = await adminApi.get<{
    runs: GhostRunRecord[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>('/api/admin/simulated-players/ghost-runs', { params });
  return data;
};

export const deleteGhostRun = async (id: string) => {
  const { data } = await adminApi.delete<{ ok: boolean }>(`/api/admin/simulated-players/ghost-runs/${id}`);
  return data;
};

export const cleanupGhostRuns = async (payload: { gameType?: string; olderThanDays?: number }) => {
  const { data } = await adminApi.delete<{ deletedCount: number }>('/api/admin/simulated-players/ghost-runs', { data: payload });
  return data;
};

export default adminApi;
