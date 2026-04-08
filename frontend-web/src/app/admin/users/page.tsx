'use client';

import { useEffect, useState } from 'react';
import adminApi from '@/lib/adminApi';
import { Paginator } from '@/components/admin/Paginator';

interface User {
  id: string;
  email: string;
  email_display: string | null;
  username: string;
  rating: number;
  xp: number;
  league: string;
  userType: string;
  isBanned: boolean;
  lastIp: string | null;
  createdAt: string;
  abandonCount30d: number;
  _count: { matchPlayers: number };
}

interface BotProfile {
  id: string;
  userId: string;
  skillLevel: number;
  personality: string;
  playStyle: string;
  mistakeRate: number;
  enabled: boolean;
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    email_display: string | null;
    rating: number;
    xp: number;
    league: string;
    _count?: { matchPlayers: number };
  };
}

const LEAGUES: Record<string, string> = {
  bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700',
  platinum: '#e5e4e2', diamond: '#b9f2ff',
};

const PERSONALITY_LABELS: Record<string, string> = {
  FAST_RISKY: '⚡ Fast Risky',
  SLOW_THINKER: '🧠 Slow Thinker',
  CASUAL_PLAYER: '😎 Casual',
  PERFECTIONIST: '🎯 Perfectionist',
  CHAOTIC_PLAYER: '🎲 Chaotic',
};

// ─── Tab Useri Reali ──────────────────────────────────────────────────────────
function RealUsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [banPending, setBanPending] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'rating' | 'league' | 'matches' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [errMsg, setErrMsg] = useState('');

  const load = async (p = page, s = search, sk = sortKey, sd = sortDir) => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/api/admin/users', {
        params: { page: p, search: s, limit: 20, userType: 'REAL', sortBy: sk ?? 'createdAt', sortDir: sd },
      });
      setUsers(data.users);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: 'rating' | 'league' | 'matches') => {
    const newDir: 'asc' | 'desc' = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
    setSortKey(key);
    setSortDir(newDir);
    setPage(1);
    load(1, search, key, newDir);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(page, search, sortKey, sortDir); }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1, search);
  };

  const msg = (text: string) => {
    setActionMsg(text);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const resetRating = async (id: string) => {
    try {
      await adminApi.patch(`/api/admin/users/${id}/reset-rating`);
      msg('Rating resetat la 1000');
      load();
    } catch {
      setErrMsg('Eroare la reset rating');
      setTimeout(() => setErrMsg(''), 3000);
    }
  };

  const toggleBan = async (id: string, isBanned: boolean) => {
    if (banPending[id]) return;
    setBanPending((prev) => ({ ...prev, [id]: true }));
    try {
      await adminApi.patch(`/api/admin/users/${id}/toggle-ban`);
      msg(isBanned ? 'User debanat' : 'User banat');
      await load();
    } finally {
      setBanPending((prev) => ({ ...prev, [id]: false }));
    }
  };

  const deleteUser = async (id: string) => {
    try {
      await adminApi.delete(`/api/admin/users/${id}`);
      setConfirmDelete(null);
      msg('User șters');
      load();
    } catch {
      setConfirmDelete(null);
      setErrMsg('Eroare la ștergere user');
      setTimeout(() => setErrMsg(''), 3000);
    }
  };

  return (
    <>
      {actionMsg && (
        <div style={{
          background: '#1a2e1a', border: '1px solid #166534', borderRadius: 8,
          padding: '10px 16px', color: '#86efac', marginBottom: 16, fontSize: 14,
        }}>
          ✅ {actionMsg}
        </div>
      )}

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Caută după username sau email..."
          style={{
            flex: 1, padding: '10px 14px', background: '#1a1d27',
            border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
            fontSize: 14, outline: 'none',
          }}
        />
        <button type="submit" style={{
          padding: '10px 20px', background: '#7c3aed', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
        }}>
          Caută
        </button>
      </form>

      <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#0f1117', color: '#64748b' }}>
              {['Username', 'Email'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
              {(['Rating', 'Liga', 'Meciuri'] as const).map((h) => {
                const key = h === 'Rating' ? 'rating' : h === 'Liga' ? 'league' : 'matches';
                const active = sortKey === key;
                return (
                  <th key={h}
                    onClick={() => handleSort(key)}
                    style={{
                      padding: '12px 16px', textAlign: 'left', fontWeight: 500,
                      cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                      color: active ? '#a78bfa' : '#64748b',
                    }}
                  >
                    {h} {active ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.35 }}>↕</span>}
                  </th>
                );
              })}
              {['Abandon 30z', 'Înregistrat', 'Acțiuni'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Se încarcă...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#475569' }}>Niciun utilizator găsit</td></tr>
            ) : users.map((u, i) => (
              <tr key={u.id} style={{ borderTop: '1px solid #1e2433', background: i % 2 === 0 ? 'transparent' : '#141720' }}>
                <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 500 }}>
                  {u.username}
                  {u.isBanned && u.abandonCount30d > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, background: '#431407',
                      color: '#fb923c', padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                    }}>BANAT · ABANDON</span>
                  )}
                  {u.isBanned && u.abandonCount30d === 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, background: '#7f1d1d',
                      color: '#fca5a5', padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                    }}>BANAT</span>
                  )}
                  {u.isBanned && u.lastIp && (
                    <span style={{
                      marginLeft: 4, fontSize: 10, background: '#1c1917',
                      color: '#78716c', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace',
                    }}>IP: {u.lastIp}</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{u.email_display ?? u.email}</td>
                <td style={{ padding: '12px 16px', color: '#a78bfa', fontWeight: 600 }}>{u.rating}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ color: LEAGUES[u.league] || '#e2e8f0', textTransform: 'capitalize', fontWeight: 500 }}>
                    {u.league}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{u._count.matchPlayers}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {u.abandonCount30d > 0 ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: u.isBanned ? '#431407' : '#1c1412',
                        color: u.isBanned ? '#fb923c' : '#a16207',
                        padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        border: `1px solid ${u.isBanned ? '#f9731644' : '#92400e44'}`,
                      }}>
                        🚫 {u.abandonCount30d}
                      </span>
                    ) : (
                      <span style={{ color: '#374151', fontSize: 12 }}>—</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(u.createdAt).toLocaleDateString('ro-RO')}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => resetRating(u.id)} style={{
                      padding: '5px 10px', background: '#1e3a5f', color: '#93c5fd',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    }}>
                      Reset elo
                    </button>
                    <button onClick={() => toggleBan(u.id, u.isBanned)} style={{
                      padding: '5px 10px',
                      background: u.isBanned ? '#1a3a1a' : '#3a2a0a',
                      color: u.isBanned ? '#86efac' : '#fcd34d',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      opacity: banPending[u.id] ? 0.65 : 1,
                    }} disabled={!!banPending[u.id]}>
                      {banPending[u.id] ? 'Se procesează...' : (u.isBanned ? '✅ Debanează' : '🚫 Banează')}
                    </button>
                    <button onClick={() => setConfirmDelete(u.id)} style={{
                      padding: '5px 10px', background: '#3b1515', color: '#fca5a5',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    }}>
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginator page={page} totalPages={Math.ceil(total / 20)} onChange={setPage} />

      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: '#00000080',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#1a1d27', border: '1px solid #7f1d1d',
            borderRadius: 12, padding: 32, maxWidth: 360, textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
            <h3 style={{ color: '#e2e8f0', marginBottom: 12 }}>Confirmare ștergere</h3>
            <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
              Această acțiune este ireversibilă. Toate datele utilizatorului vor fi șterse.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: '10px 20px', background: '#2d3748', color: '#e2e8f0',
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
                Anulează
              </button>
              <button onClick={() => deleteUser(confirmDelete)} style={{
                padding: '10px 20px', background: '#dc2626', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              }}>
                Șterge definitiv
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Tab Boți ─────────────────────────────────────────────────────────────────
function BotsTab() {
  const [profiles, setProfiles] = useState<BotProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async (p = page, s = search) => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/api/admin/simulated-players/profiles', {
        params: { page: p, search: s, limit: 20 },
      });
      setProfiles(data.profiles);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1, search);
  };

  const msg = (text: string) => {
    setActionMsg(text);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const toggleEnabled = async (profileId: string, current: boolean) => {
    try {
      await adminApi.patch(`/api/admin/simulated-players/profiles/${profileId}`, { enabled: !current });
      msg(!current ? 'Bot activat' : 'Bot dezactivat');
      load();
    } catch {
      setErrMsg('Eroare la activare/dezactivare bot');
      setTimeout(() => setErrMsg(''), 3000);
    }
  };

  const deleteBot = async (userId: string) => {
    try {
      await adminApi.delete(`/api/admin/users/${userId}`);
      setConfirmDelete(null);
      msg('Bot șters');
      load();
    } catch {
      setConfirmDelete(null);
      setErrMsg('Eroare la ștergere bot');
      setTimeout(() => setErrMsg(''), 3000);
    }
  };

  return (
    <>
      {actionMsg && (
        <div style={{
          background: '#1a2e1a', border: '1px solid #166534', borderRadius: 8,
          padding: '10px 16px', color: '#86efac', marginBottom: 16, fontSize: 14,
        }}>
          ✅ {actionMsg}
        </div>
      )}
      {errMsg && (
        <div style={{
          background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 8,
          padding: '10px 16px', color: '#fca5a5', marginBottom: 16, fontSize: 14,
        }}>
          ⚠️ {errMsg}
        </div>
      )}

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Caută bot după username..."
          style={{
            flex: 1, padding: '10px 14px', background: '#1a1d27',
            border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
            fontSize: 14, outline: 'none',
          }}
        />
        <button type="submit" style={{
          padding: '10px 20px', background: '#7c3aed', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
        }}>
          Caută
        </button>
      </form>

      <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#0f1117', color: '#64748b' }}>
              {['Username', 'Personalitate', 'Skill', 'Mistake %', 'Rating', 'Meciuri', 'Status', 'Acțiuni'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Se încarcă...</td></tr>
            ) : profiles.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#475569' }}>Niciun bot găsit</td></tr>
            ) : profiles.map((p, i) => (
              <tr key={p.id} style={{ borderTop: '1px solid #1e2433', background: i % 2 === 0 ? 'transparent' : '#141720' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🤖</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{p.user.username}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', color: '#c4b5fd', fontSize: 13 }}>
                  {PERSONALITY_LABELS[p.personality] || p.personality}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {Array.from({ length: 10 }, (_, idx) => (
                      <div key={idx} style={{
                        width: 6, height: 14, borderRadius: 2,
                        background: idx < p.skillLevel ? '#7c3aed' : '#2d3748',
                      }} />
                    ))}
                  </div>
                  <span style={{ color: '#64748b', fontSize: 11 }}>{p.skillLevel}/10</span>
                </td>
                <td style={{ padding: '12px 16px', color: '#fb923c' }}>
                  {(p.mistakeRate * 100).toFixed(0)}%
                </td>
                <td style={{ padding: '12px 16px', color: '#a78bfa', fontWeight: 600 }}>{p.user.rating}</td>
                <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                  {p.user._count?.matchPlayers ?? 0}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: p.enabled ? '#14532d' : '#1c1917',
                    color: p.enabled ? '#86efac' : '#78716c',
                  }}>
                    {p.enabled ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggleEnabled(p.user.id, p.enabled)} style={{
                      padding: '5px 10px',
                      background: p.enabled ? '#3b2000' : '#1a2e1a',
                      color: p.enabled ? '#fcd34d' : '#86efac',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    }}>
                      {p.enabled ? 'Dezactivează' : 'Activează'}
                    </button>
                    <button onClick={() => setConfirmDelete(p.user.id)} style={{
                      padding: '5px 10px', background: '#3b1515', color: '#fca5a5',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    }}>
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginator page={page} totalPages={Math.ceil(total / 20)} onChange={setPage} />

      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: '#00000080',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#1a1d27', border: '1px solid #7f1d1d',
            borderRadius: 12, padding: 32, maxWidth: 360, textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
            <h3 style={{ color: '#e2e8f0', marginBottom: 12 }}>Confirmare ștergere bot</h3>
            <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
              Boțul și toate datele asociate vor fi șterse permanent.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: '10px 20px', background: '#2d3748', color: '#e2e8f0',
                border: 'none', borderRadius: 8, cursor: 'pointer',
              }}>
                Anulează
              </button>
              <button onClick={() => deleteBot(confirmDelete)} style={{
                padding: '10px 20px', background: '#dc2626', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              }}>
                Șterge definitiv
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const [tab, setTab] = useState<'users' | 'bots'>('users');

  const tabs = [
    { id: 'users', label: '👥 Useri reali' },
    { id: 'bots',  label: '🤖 Boți' },
  ] as const;

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, marginBottom: 24 }}>
        Utilizatori
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #2d3748', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 15, fontWeight: 600,
              color: tab === t.id ? '#a78bfa' : '#64748b',
              borderBottom: tab === t.id ? '2px solid #7c3aed' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' ? <RealUsersTab /> : <BotsTab />}
    </div>
  );
}
