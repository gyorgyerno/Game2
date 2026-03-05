'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AIProfileRecord,
  BotConfig,
  createSimulatedPlayerProfile,
  getSimulatedPlayersFeatureStatus,
  listSimulatedPlayersAuditTrail,
  getSimulatedPlayersConfig,
  getSimulatedPlayersHealth,
  listSimulatedPlayerProfiles,
  patchSimulatedPlayerProfile,
  patchSimulatedPlayersConfig,
  SimulatedPlayersAuditEntry,
  SimulatedPlayersFeatureStatus,
  SimulatedPlayersHealth,
} from '@/lib/adminApi';

type ConfigDraft = {
  enabled: boolean;
  maxBotsOnline: number;
  botScoreLimit: number;
  activityFeedEnabled: boolean;
  chatEnabled: boolean;
};

const PERSONALITIES = [
  'FAST_RISKY',
  'SLOW_THINKER',
  'CASUAL_PLAYER',
  'PERFECTIONIST',
  'CHAOTIC_PLAYER',
];

const parsePreferredGames = (raw: string): string[] => {
  const cleaned = raw.trim();
  if (!cleaned) return [];
  return cleaned
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 12);
};

const formatPreferredGames = (stored: string): string => {
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === 'string').join(', ');
    }
  } catch {
    return '';
  }
  return '';
};

const asConfigDraft = (config: BotConfig): ConfigDraft => ({
  enabled: config.enabled,
  maxBotsOnline: config.maxBotsOnline,
  botScoreLimit: config.botScoreLimit,
  activityFeedEnabled: config.activityFeedEnabled,
  chatEnabled: config.chatEnabled,
});

export default function AdminSimulatedPlayersPage() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraft | null>(null);
  const [profiles, setProfiles] = useState<AIProfileRecord[]>([]);
  const [health, setHealth] = useState<SimulatedPlayersHealth | null>(null);
  const [featureStatus, setFeatureStatus] = useState<SimulatedPlayersFeatureStatus | null>(null);
  const [auditEntries, setAuditEntries] = useState<SimulatedPlayersAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [refreshingHealth, setRefreshingHealth] = useState(false);
  const [refreshingFeatureStatus, setRefreshingFeatureStatus] = useState(false);
  const [refreshingAudit, setRefreshingAudit] = useState(false);
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [newProfile, setNewProfile] = useState({
    username: '',
    email: '',
    avatarUrl: '',
    skillLevel: 5,
    personality: 'CASUAL_PLAYER',
    preferredGamesCsv: '',
    enabled: true,
  });

  const [editDrafts, setEditDrafts] = useState<Record<string, {
    username: string;
    avatarUrl: string;
    skillLevel: number;
    personality: string;
    preferredGamesCsv: string;
    enabled: boolean;
  }>>({});

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 20)), [total]);

  const toast = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const loadConfig = async () => {
    const cfg = await getSimulatedPlayersConfig();
    setConfig(cfg);
    setConfigDraft(asConfigDraft(cfg));
  };

  const loadProfiles = async (targetPage = page, targetSearch = search) => {
    const data = await listSimulatedPlayerProfiles({ page: targetPage, limit: 20, search: targetSearch.trim() || undefined });
    setProfiles(data.profiles);
    setTotal(data.total);

    const drafts: Record<string, {
      username: string;
      avatarUrl: string;
      skillLevel: number;
      personality: string;
      preferredGamesCsv: string;
      enabled: boolean;
    }> = {};

    for (const profile of data.profiles) {
      drafts[profile.userId] = {
        username: profile.user.username,
        avatarUrl: profile.user.avatarUrl || '',
        skillLevel: profile.skillLevel,
        personality: profile.personality,
        preferredGamesCsv: formatPreferredGames(profile.preferredGames),
        enabled: profile.enabled,
      };
    }
    setEditDrafts(drafts);
  };

  const loadHealth = async () => {
    const data = await getSimulatedPlayersHealth();
    setHealth(data);
  };

  const loadFeatureStatus = async () => {
    const data = await getSimulatedPlayersFeatureStatus();
    setFeatureStatus(data);
  };

  const loadAuditTrail = async () => {
    const entries = await listSimulatedPlayersAuditTrail(30);
    setAuditEntries(entries);
  };

  const loadAll = async (targetPage = page, targetSearch = search) => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadConfig(), loadProfiles(targetPage, targetSearch), loadHealth(), loadFeatureStatus(), loadAuditTrail()]);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-au putut încărca datele pentru simulated players');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll(page, search);
  }, [page]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadAll(1, search);
  };

  const saveConfig = async () => {
    if (!configDraft) return;
    setSavingConfig(true);
    setError('');
    try {
      const updated = await patchSimulatedPlayersConfig(configDraft);
      setConfig(updated);
      setConfigDraft(asConfigDraft(updated));
      toast('Configurația globală a fost salvată');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-a putut salva configurația');
    } finally {
      setSavingConfig(false);
    }
  };

  const createProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createSimulatedPlayerProfile({
        username: newProfile.username.trim(),
        email: newProfile.email.trim() || undefined,
        avatarUrl: newProfile.avatarUrl.trim() || undefined,
        skillLevel: newProfile.skillLevel,
        personality: newProfile.personality,
        preferredGames: parsePreferredGames(newProfile.preferredGamesCsv),
        enabled: newProfile.enabled,
      });

      setNewProfile({
        username: '',
        email: '',
        avatarUrl: '',
        skillLevel: 5,
        personality: 'CASUAL_PLAYER',
        preferredGamesCsv: '',
        enabled: true,
      });

      toast('Profil AI creat');
      loadAll(page, search);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-a putut crea profilul AI');
    }
  };

  const saveProfile = async (userId: string) => {
    const draft = editDrafts[userId];
    if (!draft) return;

    setSavingProfileId(userId);
    setError('');
    try {
      await patchSimulatedPlayerProfile(userId, {
        username: draft.username.trim(),
        avatarUrl: draft.avatarUrl.trim() || null,
        skillLevel: Number(draft.skillLevel),
        personality: draft.personality,
        preferredGames: parsePreferredGames(draft.preferredGamesCsv),
        enabled: draft.enabled,
      });
      toast('Profil AI actualizat');
      loadProfiles(page, search);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-a putut actualiza profilul AI');
    } finally {
      setSavingProfileId(null);
    }
  };

  const refreshHealth = async () => {
    setRefreshingHealth(true);
    setError('');
    try {
      await loadHealth();
      toast('Health refresh făcut');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-a putut încărca health');
    } finally {
      setRefreshingHealth(false);
    }
  };

  const refreshFeatureStatus = async () => {
    setRefreshingFeatureStatus(true);
    setError('');
    try {
      await loadFeatureStatus();
      toast('Feature status refresh făcut');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-a putut încărca feature status');
    } finally {
      setRefreshingFeatureStatus(false);
    }
  };

  const refreshAuditTrail = async () => {
    setRefreshingAudit(true);
    setError('');
    try {
      await loadAuditTrail();
      toast('Audit trail refresh făcut');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-a putut încărca audit trail');
    } finally {
      setRefreshingAudit(false);
    }
  };

  const chatGuardrailBlocked = Boolean(configDraft?.chatEnabled && health && !health.features.botChatEnabled);
  const feedGuardrailBlocked = Boolean(configDraft?.activityFeedEnabled && health && !health.features.botActivityFeedEnabled);

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        🤖 Simulated Players
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Configurație globală + management profile AI
      </p>

      {message && (
        <div style={{
          background: '#1a2e1a', border: '1px solid #166534', borderRadius: 8,
          padding: '10px 16px', color: '#86efac', marginBottom: 16, fontSize: 14,
        }}>
          ✅ {message}
        </div>
      )}

      {error && (
        <div style={{
          background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 8,
          padding: '10px 16px', color: '#fca5a5', marginBottom: 16, fontSize: 14,
        }}>
          ⚠️ {error}
        </div>
      )}

      {loading || !configDraft ? (
        <p style={{ color: '#64748b' }}>Se încarcă...</p>
      ) : (
        <>
          <section style={{
            background: '#1a1d27', border: '1px solid #2d3748',
            borderRadius: 12, padding: 20, marginBottom: 24,
          }}>
            <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600, marginBottom: 14 }}>
              Config global bots
            </h2>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 14 }}>
              <label style={{ color: '#cbd5e1', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={configDraft.enabled}
                  onChange={(e) => setConfigDraft((prev) => prev ? { ...prev, enabled: e.target.checked } : prev)}
                  style={{ marginRight: 8 }}
                />
                Enable simulated players
              </label>

              <label style={{ color: '#cbd5e1', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={configDraft.activityFeedEnabled}
                  onChange={(e) => setConfigDraft((prev) => prev ? { ...prev, activityFeedEnabled: e.target.checked } : prev)}
                  style={{ marginRight: 8 }}
                />
                Activity feed bots
              </label>

              <label style={{ color: '#cbd5e1', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={configDraft.chatEnabled}
                  onChange={(e) => setConfigDraft((prev) => prev ? { ...prev, chatEnabled: e.target.checked } : prev)}
                  style={{ marginRight: 8 }}
                />
                Chat bots
              </label>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 14 }}>
              <label style={{ color: '#94a3b8', fontSize: 13 }}>
                Max bots online
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={configDraft.maxBotsOnline}
                  onChange={(e) => setConfigDraft((prev) => prev ? { ...prev, maxBotsOnline: Number(e.target.value) } : prev)}
                  style={{
                    width: '100%', marginTop: 6, padding: '8px 10px', background: '#0f1117',
                    border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
                  }}
                />
              </label>

              <label style={{ color: '#94a3b8', fontSize: 13 }}>
                Bot score limit
                <input
                  type="number"
                  min={0}
                  value={configDraft.botScoreLimit}
                  onChange={(e) => setConfigDraft((prev) => prev ? { ...prev, botScoreLimit: Number(e.target.value) } : prev)}
                  style={{
                    width: '100%', marginTop: 6, padding: '8px 10px', background: '#0f1117',
                    border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
                  }}
                />
              </label>
            </div>

            <button
              onClick={saveConfig}
              disabled={savingConfig}
              style={{
                padding: '10px 16px', background: savingConfig ? '#374151' : '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 8, cursor: savingConfig ? 'not-allowed' : 'pointer', fontWeight: 600,
              }}
            >
              {savingConfig ? 'Se salvează...' : 'Salvează config'}
            </button>
          </section>

          <section style={{
            background: '#1a1d27', border: '1px solid #2d3748',
            borderRadius: 12, padding: 20, marginBottom: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600 }}>
                Health & guardrails
              </h2>
              <button
                onClick={refreshHealth}
                disabled={refreshingHealth}
                style={{
                  padding: '8px 12px', background: refreshingHealth ? '#374151' : '#334155', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: refreshingHealth ? 'not-allowed' : 'pointer', fontSize: 13,
                }}
              >
                {refreshingHealth ? 'Refresh...' : 'Refresh health'}
              </button>
            </div>

            {!health ? (
              <p style={{ color: '#64748b' }}>Health indisponibil.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 12 }}>
                  <div style={{ background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Simulated users</div>
                    <div style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 700 }}>{health.counters.simulatedUsers}</div>
                  </div>
                  <div style={{ background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Enabled AI profiles</div>
                    <div style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 700 }}>{health.counters.enabledProfiles}</div>
                  </div>
                  <div style={{ background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Waiting matches with bots</div>
                    <div style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 700 }}>{health.counters.waitingMatchesWithBots}</div>
                  </div>
                  <div style={{ background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, padding: 10 }}>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Scheduled matches</div>
                    <div style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 700 }}>{health.orchestrator.scheduledMatches}</div>
                  </div>
                </div>

                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>
                  Feature flags runtime: SIM={health.features.simPlayersEnabled ? 'ON' : 'OFF'} | GHOST={health.features.ghostPlayersEnabled ? 'ON' : 'OFF'} | CHAT={health.features.botChatEnabled ? 'ON' : 'OFF'} | FEED={health.features.botActivityFeedEnabled ? 'ON' : 'OFF'}
                </div>

                {(chatGuardrailBlocked || feedGuardrailBlocked) && (
                  <div style={{
                    background: '#3b2f12', border: '1px solid #a16207', borderRadius: 8,
                    padding: '10px 12px', color: '#fcd34d', fontSize: 13,
                  }}>
                    Guardrail activ: config DB are toggle ON, dar feature flag-ul runtime este OFF pentru
                    {chatGuardrailBlocked ? ' chat' : ''}
                    {chatGuardrailBlocked && feedGuardrailBlocked ? ' și' : ''}
                    {feedGuardrailBlocked ? ' activity feed' : ''}.
                  </div>
                )}
              </>
            )}
          </section>

          <section style={{
            background: '#1a1d27', border: '1px solid #2d3748',
            borderRadius: 12, padding: 20, marginBottom: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600 }}>
                Effective toggles (requested vs runtime)
              </h2>
              <button
                onClick={refreshFeatureStatus}
                disabled={refreshingFeatureStatus}
                style={{
                  padding: '8px 12px', background: refreshingFeatureStatus ? '#374151' : '#334155', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: refreshingFeatureStatus ? 'not-allowed' : 'pointer', fontSize: 13,
                }}
              >
                {refreshingFeatureStatus ? 'Refresh...' : 'Refresh status'}
              </button>
            </div>

            {!featureStatus ? (
              <p style={{ color: '#64748b' }}>Feature status indisponibil.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {([
                  { key: 'simPlayers', label: 'Simulated players' },
                  { key: 'chat', label: 'Bot chat' },
                  { key: 'activityFeed', label: 'Activity feed' },
                ] as Array<{ key: keyof SimulatedPlayersFeatureStatus['effective']; label: string }>).map((item) => {
                  const requested = featureStatus.configRequested[item.key];
                  const runtime = featureStatus.runtimeFlags[item.key];
                  const effective = featureStatus.effective[item.key];
                  const blockers = featureStatus.blockers[item.key];

                  return (
                    <div key={item.key} style={{
                      background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8,
                      padding: '10px 12px',
                    }}>
                      <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                        {item.label}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                        requested(DB): {requested ? 'ON' : 'OFF'} • runtime(flag): {runtime ? 'ON' : 'OFF'} • effective: {effective ? 'ON' : 'OFF'}
                      </div>
                      {!effective && blockers.length > 0 && (
                        <div style={{ color: '#fbbf24', fontSize: 12 }}>
                          blockers: {blockers.join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section style={{
            background: '#1a1d27', border: '1px solid #2d3748',
            borderRadius: 12, padding: 20, marginBottom: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600 }}>
                Audit trail (ultimele acțiuni)
              </h2>
              <button
                onClick={refreshAuditTrail}
                disabled={refreshingAudit}
                style={{
                  padding: '8px 12px', background: refreshingAudit ? '#374151' : '#334155', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: refreshingAudit ? 'not-allowed' : 'pointer', fontSize: 13,
                }}
              >
                {refreshingAudit ? 'Refresh...' : 'Refresh audit'}
              </button>
            </div>

            {auditEntries.length === 0 ? (
              <p style={{ color: '#64748b' }}>Nu există încă evenimente relevante astăzi.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {auditEntries.map((entry, index) => (
                  <div key={`${entry.timestamp || 'ts'}-${index}`} style={{
                    background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8,
                    padding: '10px 12px',
                  }}>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                      {entry.message}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString('ro-RO') : '-'}
                      {entry.admin ? ` • admin=${entry.admin}` : ''}
                      {entry.username ? ` • user=${entry.username}` : ''}
                      {entry.deletedCount !== null ? ` • deleted=${entry.deletedCount}` : ''}
                      {entry.gameType ? ` • gameType=${entry.gameType}` : ''}
                      {entry.olderThanDays !== null ? ` • olderThanDays=${entry.olderThanDays}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{
            background: '#1a1d27', border: '1px solid #2d3748',
            borderRadius: 12, padding: 20, marginBottom: 24,
          }}>
            <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              Creează profil AI
            </h2>

            <form onSubmit={createProfile} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <input
                required
                placeholder="Username"
                value={newProfile.username}
                onChange={(e) => setNewProfile((prev) => ({ ...prev, username: e.target.value }))}
                style={{ padding: '9px 10px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0' }}
              />
              <input
                placeholder="Email (opțional)"
                value={newProfile.email}
                onChange={(e) => setNewProfile((prev) => ({ ...prev, email: e.target.value }))}
                style={{ padding: '9px 10px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0' }}
              />
              <input
                placeholder="Avatar URL (opțional)"
                value={newProfile.avatarUrl}
                onChange={(e) => setNewProfile((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                style={{ padding: '9px 10px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0' }}
              />
              <input
                type="number"
                min={1}
                max={10}
                value={newProfile.skillLevel}
                onChange={(e) => setNewProfile((prev) => ({ ...prev, skillLevel: Number(e.target.value) }))}
                style={{ padding: '9px 10px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0' }}
              />
              <select
                value={newProfile.personality}
                onChange={(e) => setNewProfile((prev) => ({ ...prev, personality: e.target.value }))}
                style={{ padding: '9px 10px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0' }}
              >
                {PERSONALITIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <input
                placeholder="Preferred games (csv: integrame,maze)"
                value={newProfile.preferredGamesCsv}
                onChange={(e) => setNewProfile((prev) => ({ ...prev, preferredGamesCsv: e.target.value }))}
                style={{ padding: '9px 10px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0' }}
              />
              <label style={{ color: '#cbd5e1', fontSize: 14, display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={newProfile.enabled}
                  onChange={(e) => setNewProfile((prev) => ({ ...prev, enabled: e.target.checked }))}
                  style={{ marginRight: 8 }}
                />
                Profil activ
              </label>
              <button
                type="submit"
                style={{
                  padding: '10px 14px', background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
                }}
              >
                Creează
              </button>
            </form>
          </section>

          <section style={{
            background: '#1a1d27', border: '1px solid #2d3748',
            borderRadius: 12, padding: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600 }}>
                Profile AI ({total})
              </h2>
              <form onSubmit={onSearch} style={{ display: 'flex', gap: 8 }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Caută username/email"
                  style={{
                    padding: '8px 10px', background: '#0f1117', border: '1px solid #2d3748',
                    borderRadius: 8, color: '#e2e8f0', minWidth: 220,
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '8px 12px', background: '#334155', color: '#fff',
                    border: 'none', borderRadius: 8, cursor: 'pointer',
                  }}
                >
                  Caută
                </button>
              </form>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#0f1117', color: '#64748b' }}>
                    {['Username', 'Email', 'Skill', 'Personality', 'Preferred games', 'Status', 'Acțiune'].map((head) => (
                      <th key={head} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile, idx) => {
                    const draft = editDrafts[profile.userId];
                    if (!draft) return null;
                    const disabled = savingProfileId === profile.userId;

                    return (
                      <tr key={profile.id} style={{ borderTop: '1px solid #1e2433', background: idx % 2 ? '#141720' : 'transparent' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <input
                            value={draft.username}
                            onChange={(e) => setEditDrafts((prev) => ({
                              ...prev,
                              [profile.userId]: { ...prev[profile.userId], username: e.target.value },
                            }))}
                            style={{ width: '100%', padding: '7px 8px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 6, color: '#e2e8f0' }}
                          />
                        </td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{profile.user.email}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={draft.skillLevel}
                            onChange={(e) => setEditDrafts((prev) => ({
                              ...prev,
                              [profile.userId]: { ...prev[profile.userId], skillLevel: Number(e.target.value) },
                            }))}
                            style={{ width: 72, padding: '7px 8px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 6, color: '#e2e8f0' }}
                          />
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <select
                            value={draft.personality}
                            onChange={(e) => setEditDrafts((prev) => ({
                              ...prev,
                              [profile.userId]: { ...prev[profile.userId], personality: e.target.value },
                            }))}
                            style={{ padding: '7px 8px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 6, color: '#e2e8f0' }}
                          >
                            {PERSONALITIES.map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <input
                            value={draft.preferredGamesCsv}
                            onChange={(e) => setEditDrafts((prev) => ({
                              ...prev,
                              [profile.userId]: { ...prev[profile.userId], preferredGamesCsv: e.target.value },
                            }))}
                            placeholder="integrame, maze"
                            style={{ width: '100%', minWidth: 180, padding: '7px 8px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 6, color: '#e2e8f0' }}
                          />
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <label style={{ color: '#cbd5e1', fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={draft.enabled}
                              onChange={(e) => setEditDrafts((prev) => ({
                                ...prev,
                                [profile.userId]: { ...prev[profile.userId], enabled: e.target.checked },
                              }))}
                              style={{ marginRight: 6 }}
                            />
                            {draft.enabled ? 'ON' : 'OFF'}
                          </label>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            onClick={() => saveProfile(profile.userId)}
                            disabled={disabled}
                            style={{
                              padding: '7px 10px', background: disabled ? '#374151' : '#059669', color: '#fff',
                              border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
                            }}
                          >
                            {disabled ? '...' : 'Salvează'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center' }}>
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    padding: '6px 11px', background: p === page ? '#7c3aed' : '#0f1117',
                    color: p === page ? '#fff' : '#94a3b8', border: '1px solid #2d3748', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
