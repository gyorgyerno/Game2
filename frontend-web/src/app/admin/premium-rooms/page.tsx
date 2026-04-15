'use client';
import { useEffect, useState, useCallback } from 'react';
import adminApi from '@/lib/adminApi';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PremiumConfig {
  id: number;
  enabled: boolean;
  maxPlayersPerRoom: number;
  maxRoomsPerDayUser: number;
  maxRoundsPerRoom: number;
  defaultTimeLimit: number;
  maxSpectators: number;
  allowGuestJoin: boolean;
  updatedAt: string;
}

interface RecentRoom {
  id: string;
  code: string;
  ownerUsername: string;
  status: string;
  mode: string;
  playerCount: number;
  createdAt: string;
}

interface Overview {
  totalRooms: number;
  activeRooms: number;
  todayRooms: number;
  totalPremiumUsers: number;
  recentRooms: RecentRoom[];
  topCreatorsThisWeek: { username: string; rooms: number }[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  lobby: '#f59e0b',
  active: '#10b981',
  finished: '#64748b',
};

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12,
      padding: '18px 22px', minWidth: 140,
    }}>
      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function NumberInput({
  label, hint, value, min, max, onChange,
}: {
  label: string; hint?: string; value: number;
  min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: '#94a3b8', fontSize: 12 }}>{label}</label>
      <input
        type="number"
        min={min} max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          background: '#0f1117', border: '1px solid #374151', borderRadius: 8,
          color: '#e2e8f0', padding: '8px 12px', fontSize: 15, width: 120,
          outline: 'none',
        }}
      />
      {hint && <span style={{ color: '#475569', fontSize: 11 }}>{hint}</span>}
    </div>
  );
}

// ─── User Plan Manager ─────────────────────────────────────────────────────────
interface UserRow {
  id: string;
  username: string;
  email_display?: string;
  plan: string;
  isBanned: boolean;
  createdAt: string;
}

function UserPlanManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback((q: string) => {
    setLoading(true);
    adminApi.get(`/api/admin/users?search=${encodeURIComponent(q)}&limit=20`)
      .then(r => setUsers(r.data.users ?? r.data))
      .catch(() => setMsg('Eroare la încărcare utilizatori'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(''); }, [load]);

  const togglePlan = (user: UserRow) => {
    const newPlan = user.plan === 'premium' ? 'free' : 'premium';
    setSaving(user.id);
    adminApi.patch(`/api/admin/users/${user.id}/plan`, { plan: newPlan })
      .then(() => {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, plan: newPlan } : u));
        setMsg(`${user.username} → ${newPlan}`);
        setTimeout(() => setMsg(''), 2500);
      })
      .catch(() => setMsg('Eroare la salvare'))
      .finally(() => setSaving(null));
  };

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, margin: 0 }}>👥 Plan utilizatori</h3>
        {msg && <span style={{ color: '#10b981', fontSize: 13 }}>{msg}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          placeholder="Caută după username..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(search)}
          style={{
            background: '#0f1117', border: '1px solid #374151', borderRadius: 8,
            color: '#e2e8f0', padding: '8px 12px', fontSize: 14, flex: 1, outline: 'none',
          }}
        />
        <button
          onClick={() => load(search)}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >Caută</button>
      </div>
      {loading
        ? <div style={{ color: '#64748b', fontSize: 13 }}>Se încarcă...</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3748' }}>
                  {['Username', 'Email', 'Plan', 'Acțiune'].map(h => (
                    <th key={h} style={{ color: '#64748b', textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #1e2535' }}>
                    <td style={{ padding: '8px 10px', color: '#e2e8f0', fontWeight: 500 }}>{u.username}</td>
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>{u.email_display ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        background: u.plan === 'premium' ? '#451a03' : '#1e293b',
                        border: `1px solid ${u.plan === 'premium' ? '#f59e0b66' : '#334155'}`,
                        color: u.plan === 'premium' ? '#fbbf24' : '#94a3b8',
                        borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600,
                      }}>
                        {u.plan === 'premium' ? '💎 Premium' : 'Free'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <button
                        onClick={() => togglePlan(u)}
                        disabled={saving === u.id}
                        style={{
                          background: u.plan === 'premium' ? '#374151' : '#78350f',
                          border: `1px solid ${u.plan === 'premium' ? '#4b5563' : '#b45309'}`,
                          color: u.plan === 'premium' ? '#9ca3af' : '#fbbf24',
                          borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600,
                          opacity: saving === u.id ? 0.5 : 1,
                        }}
                      >
                        {saving === u.id ? '...' : u.plan === 'premium' ? '→ Free' : '→ Premium'}
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 20, color: '#475569', textAlign: 'center' }}>Niciun utilizator găsit</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPremiumRoomsPage() {
  const [config, setConfig] = useState<PremiumConfig | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [form, setForm] = useState<Partial<PremiumConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [tab, setTab] = useState<'overview' | 'config' | 'users'>('overview');

  const loadAll = useCallback(() => {
    adminApi.get('/api/admin/premium-rooms/config').then(r => {
      setConfig(r.data);
      setForm(r.data);
    });
    adminApi.get('/api/admin/premium-rooms/overview').then(r => setOverview(r.data));
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const save = () => {
    if (!form) return;
    setSaving(true);
    adminApi.patch('/api/admin/premium-rooms/config', form)
      .then(r => { setConfig(r.data); setForm(r.data); setSaveMsg('✅ Salvat!'); setTimeout(() => setSaveMsg(''), 2500); })
      .catch(() => setSaveMsg('❌ Eroare'))
      .finally(() => setSaving(false));
  };

  const tabStyle = (t: typeof tab): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    background: tab === t ? '#7c3aed' : '#1a1d27',
    color: tab === t ? '#fff' : '#64748b',
  });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, margin: 0 }}>💎 Premium Rooms</h1>
        {config && (
          <span style={{
            background: config.enabled ? '#064e3b' : '#3f1f1f',
            border: `1px solid ${config.enabled ? '#10b98155' : '#ef444455'}`,
            color: config.enabled ? '#10b981' : '#ef4444',
            borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
          }}>
            {config.enabled ? '● Activ' : '● Oprit'}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button style={tabStyle('overview')} onClick={() => setTab('overview')}>📊 Overview</button>
        <button style={tabStyle('config')} onClick={() => setTab('config')}>⚙️ Setări</button>
        <button style={tabStyle('users')} onClick={() => setTab('users')}>👥 Utilizatori</button>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && overview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatBox label="Total camere" value={overview.totalRooms} />
            <StatBox label="Active acum" value={overview.activeRooms} sub="lobby + în joc" />
            <StatBox label="Azi create" value={overview.todayRooms} />
            <StatBox label="Useri Premium" value={overview.totalPremiumUsers} />
          </div>

          {/* Top creatori */}
          {overview.topCreatorsThisWeek.length > 0 && (
            <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>
                🏆 Top creatori — săptămâna aceasta
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overview.topCreatorsThisWeek.map((c, i) => (
                  <div key={c.username} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#f59e0b', fontWeight: 700, width: 20 }}>#{i + 1}</span>
                    <span style={{ color: '#e2e8f0', flex: 1 }}>{c.username}</span>
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>{c.rooms} camere</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Camere recente */}
          <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, padding: 20 }}>
            <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>
              🕐 Camere recente
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2d3748' }}>
                    {['Cod', 'Owner', 'Status', 'Mod', 'Jucători', 'Creat la'].map(h => (
                      <th key={h} style={{ color: '#64748b', textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overview.recentRooms.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #1e2535' }}>
                      <td style={{ padding: '8px 10px', color: '#fbbf24', fontFamily: 'monospace', fontWeight: 700 }}>{r.code}</td>
                      <td style={{ padding: '8px 10px', color: '#e2e8f0' }}>{r.ownerUsername}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          background: STATUS_COLOR[r.status] + '22',
                          color: STATUS_COLOR[r.status],
                          border: `1px solid ${STATUS_COLOR[r.status]}44`,
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                        }}>{r.status}</span>
                      </td>
                      <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{r.mode}</td>
                      <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{r.playerCount}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 11 }}>
                        {new Date(r.createdAt).toLocaleString('ro-RO')}
                      </td>
                    </tr>
                  ))}
                  {overview.recentRooms.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 20, color: '#475569', textAlign: 'center' }}>Nicio cameră creată încă</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIG ── */}
      {tab === 'config' && config && form && (
        <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, padding: 24 }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, margin: '0 0 20px' }}>⚙️ Setări globale Premium Rooms</h3>

          {/* Feature flag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '14px 16px', background: '#0f1117', borderRadius: 10, border: '1px solid #374151' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>Feature activ</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>Dezactivat = nimeni nu poate crea sau vedea Premium Rooms</div>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              style={{
                background: form.enabled ? '#064e3b' : '#3f1f1f',
                border: `1px solid ${form.enabled ? '#10b98155' : '#ef444455'}`,
                color: form.enabled ? '#10b981' : '#ef4444',
                borderRadius: 8, padding: '6px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              }}
            >
              {form.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Guest join */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '14px 16px', background: '#0f1117', borderRadius: 10, border: '1px solid #374151' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>Permite join fără Premium</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>Un user fără plan premium poate intra cu cod în cameră</div>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, allowGuestJoin: !f.allowGuestJoin }))}
              style={{
                background: form.allowGuestJoin ? '#064e3b' : '#3f1f1f',
                border: `1px solid ${form.allowGuestJoin ? '#10b98155' : '#ef444455'}`,
                color: form.allowGuestJoin ? '#10b981' : '#ef4444',
                borderRadius: 8, padding: '6px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              }}
            >
              {form.allowGuestJoin ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Numeric settings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
            <NumberInput
              label="Max jucători / cameră"
              hint="2 – 50"
              value={form.maxPlayersPerRoom ?? 8}
              min={2} max={50}
              onChange={v => setForm(f => ({ ...f, maxPlayersPerRoom: v }))}
            />
            <NumberInput
              label="Max camere / zi / user"
              hint="1 – 100"
              value={form.maxRoomsPerDayUser ?? 10}
              min={1} max={100}
              onChange={v => setForm(f => ({ ...f, maxRoomsPerDayUser: v }))}
            />
            <NumberInput
              label="Max runde / cameră"
              hint="1 – 50"
              value={form.maxRoundsPerRoom ?? 20}
              min={1} max={50}
              onChange={v => setForm(f => ({ ...f, maxRoundsPerRoom: v }))}
            />
            <NumberInput
              label="Timp implicit / rundă (sec)"
              hint="10 – 600"
              value={form.defaultTimeLimit ?? 60}
              min={10} max={600}
              onChange={v => setForm(f => ({ ...f, defaultTimeLimit: v }))}
            />
            <NumberInput
              label="Max spectatori / cameră"
              hint="0 = dezactivat"
              value={form.maxSpectators ?? 20}
              min={0} max={100}
              onChange={v => setForm(f => ({ ...f, maxSpectators: v }))}
            />
          </div>

          {/* Save */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                background: saving ? '#374151' : '#7c3aed',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 28px', cursor: saving ? 'default' : 'pointer',
                fontWeight: 700, fontSize: 14,
              }}
            >
              {saving ? 'Se salvează...' : 'Salvează setările'}
            </button>
            {saveMsg && <span style={{ color: saveMsg.startsWith('✅') ? '#10b981' : '#ef4444', fontSize: 13 }}>{saveMsg}</span>}
          </div>

          <div style={{ color: '#475569', fontSize: 11, marginTop: 10 }}>
            Ultima modificare: {config.updatedAt ? new Date(config.updatedAt).toLocaleString('ro-RO') : '—'}
          </div>
        </div>
      )}

      {/* ── USERS ── */}
      {tab === 'users' && <UserPlanManager />}
    </div>
  );
}
