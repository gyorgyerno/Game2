'use client';

import { useEffect, useRef, useState } from 'react';
import { io as socketIO } from 'socket.io-client';
import adminApi from '@/lib/adminApi';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

interface DashboardData {
  live: { onlineUsers: number; activeMatches: number; waitingMatches: number };
  today: { newUsers: number; finishedMatches: number; abandonRate: number };
  yesterday: { newUsers: number; finishedMatches: number };
  alerts: { stuckCount: number; highAbandon: boolean };
  platforms: Record<string, number>;
  recentActivity: { type: string; username: string; description: string; at: string }[];
}

function delta(today: number, yesterday: number) {
  if (yesterday === 0) return { pct: today > 0 ? 100 : 0, up: true };
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [age, setAge] = useState(0);
  const [error, setError] = useState('');
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function loadData() {
    adminApi.get('/api/admin/dashboard')
      .then(r => { setData(r.data); setAge(0); setError(''); })
      .catch(() => setError('Eroare la încărcare'));
  }

  useEffect(() => {
    loadData();
    refreshRef.current = setInterval(loadData, 30_000);
    tickRef.current = setInterval(() => setAge(a => a + 1), 1_000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Admin WebSocket — live stats push ────────────────────────────────────
  useEffect(() => {
    const adminToken = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
    if (!adminToken) return;
    const adminSocket = socketIO(`${SOCKET_URL}/admin-ws`, {
      auth: { token: adminToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    adminSocket.on('admin_stats_update', (update: { onlineUsers: number; activeMatches: number; waitingMatches: number }) => {
      setData(prev => prev ? { ...prev, live: update } : prev);
      setAge(0);
    });
    return () => { adminSocket.disconnect(); };
  }, []);

  const usersD = data ? delta(data.today.newUsers, data.yesterday.newUsers) : null;
  const matchesD = data ? delta(data.today.finishedMatches, data.yesterday.finishedMatches) : null;
  const totalPlatform = data ? Object.values(data.platforms).reduce((s, n) => s + n, 0) : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, margin: 0 }}>Mission Control</h1>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#0d2a1a', border: '1px solid #10b98155',
          borderRadius: 20, padding: '4px 12px',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>LIVE</span>
        </div>
        <span style={{ color: '#475569', fontSize: 13 }}>
          {age === 0 ? 'tocmai actualizat' : `actualizat acum ${age}s`}
        </span>
        <button onClick={loadData} style={{
          marginLeft: 'auto', background: '#1e2433', border: '1px solid #2d3748',
          color: '#94a3b8', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
        }}>↻ Refresh</button>
      </div>

      {error && (
        <div style={{ background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', color: '#fca5a5', marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      {!data ? (
        <p style={{ color: '#64748b' }}>Se încarcă...</p>
      ) : (
        <>
          {/* Alerts */}
          {(data.alerts.stuckCount > 0 || data.alerts.highAbandon) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {data.alerts.stuckCount > 0 && (
                <div style={{ background: '#2d1a00', border: '1px solid #92400e', borderRadius: 8, padding: '10px 16px', color: '#fbbf24', fontSize: 14 }}>
                  ⚠️ <strong>{data.alerts.stuckCount} meciuri blocate</strong> —{' '}
                  <a href="/admin/matches" style={{ color: '#f59e0b', textDecoration: 'underline' }}>
                    Vezi în Matches
                  </a>
                </div>
              )}
              {data.alerts.highAbandon && (
                <div style={{ background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 16px', color: '#fca5a5', fontSize: 14 }}>
                  📈 <strong>Abandon ridicat azi: {data.today.abandonRate}%</strong> — rata depășește 30%
                </div>
              )}
            </div>
          )}

          {/* Live KPIs */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
            {[
              { label: 'Online acum', value: data.live.onlineUsers, icon: '🟢', color: '#10b981', d: null, ieri: undefined },
              { label: 'Meciuri active', value: data.live.activeMatches, icon: '🔥', color: '#f59e0b', d: null, ieri: undefined },
              { label: 'În lobby', value: data.live.waitingMatches, icon: '⏳', color: '#06b6d4', d: null, ieri: undefined },
              { label: 'Useri noi azi', value: data.today.newUsers, icon: '✨', color: '#7c3aed', d: usersD, ieri: data.yesterday.newUsers },
              { label: 'Meciuri azi', value: data.today.finishedMatches, icon: '🎮', color: '#10b981', d: matchesD, ieri: data.yesterday.finishedMatches },
              { label: 'Abandon azi', value: `${data.today.abandonRate}%`, icon: '🚪', color: data.today.abandonRate >= 30 ? '#ef4444' : '#64748b', d: null, ieri: undefined },
            ].map(({ label, value, icon, color, d, ieri }) => (
              <div key={label} style={{ background: '#1a1d27', border: `1px solid ${color}33`, borderRadius: 12, padding: '20px 24px', flex: '1 1 140px' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, color }}>{value}</span>
                  {d && <span style={{ color: d.up ? '#10b981' : '#ef4444', fontSize: 13 }}>{d.up ? '▲' : '▼'} {d.pct}%</span>}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{label}</div>
                {ieri !== undefined && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>ieri: {ieri}</div>}
              </div>
            ))}
          </div>

          {/* Activity + Platforms */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* Recent activity */}
            <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, padding: '20px 24px' }}>
              <h2 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, margin: '0 0 16px 0' }}>🕐 Activitate recentă</h2>
              {data.recentActivity.length === 0
                ? <p style={{ color: '#475569', fontSize: 13 }}>Nicio activitate</p>
                : data.recentActivity.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px', background: '#12151e', borderRadius: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{item.type === 'user' ? '👤' : '🎮'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.username}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{item.description} · {new Date(item.at).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))
              }
            </div>

            {/* Platform breakdown */}
            <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, padding: '20px 24px' }}>
              <h2 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, margin: '0 0 16px 0' }}>📱 Platforme utilizatori</h2>
              {Object.keys(data.platforms).length === 0
                ? <p style={{ color: '#475569', fontSize: 13 }}>Nicio dată disponibilă</p>
                : Object.entries(data.platforms).map(([p, cnt]) => {
                  const pct = totalPlatform > 0 ? Math.round((cnt / totalPlatform) * 100) : 0;
                  const pc = p === 'ios' ? '#7c3aed' : p === 'android' ? '#10b981' : '#06b6d4';
                  return (
                    <div key={p} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: '#e2e8f0', textTransform: 'capitalize' }}>{p}</span>
                        <span style={{ fontSize: 13, color: '#94a3b8' }}>{cnt} ({pct}%)</span>
                      </div>
                      <div style={{ background: '#2d3748', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pc, borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, padding: '20px 24px' }}>
            <h2 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, margin: '0 0 16px 0' }}>⚡ Acțiuni rapide</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { href: '/admin/games', label: '🕹️ Jocuri' },
                { href: '/admin/simulated-players', label: '🤖 Simulated AI' },
                { href: '/admin/users', label: '👥 Utilizatori' },
                { href: '/admin/matches', label: '🎮 Matches' },
                { href: '/admin/invites', label: '🎫 Invites' },
                { href: '/admin/logs', label: '📋 Loguri' },
                { href: '/admin/stats', label: '📊 Analytics' },
              ].map(({ href, label }) => (
                <a key={href} href={href} style={{
                  padding: '10px 16px', background: '#2d3748', color: '#e2e8f0',
                  borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500,
                }}>
                  {label}
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
