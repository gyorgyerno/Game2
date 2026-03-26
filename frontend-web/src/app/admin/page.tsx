'use client';

import { useEffect, useState } from 'react';
import adminApi from '@/lib/adminApi';

interface Stats {
  totalUsers: number;
  totalMatches: number;
  activeMatches: number;
  totalInvites: number;
  recentUsers: number;
}

interface GameDayRow {
  date: string;
  [gameType: string]: string | number;
}

interface GameStatsData {
  data: GameDayRow[];
  gameTypes: string[];
  days: number;
}

const GAME_COLORS: Record<string, string> = {
  quiz: '#7c3aed',
  labirinturi: '#10b981',
  maze: '#10b981',
  trivia: '#f59e0b',
  default: '#06b6d4',
};

function gameColor(gt: string) {
  return GAME_COLORS[gt] ?? GAME_COLORS.default;
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div style={{
      background: '#1a1d27', border: `1px solid ${color}33`,
      borderRadius: 12, padding: '24px', flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 8, background: '#2d3748', borderRadius: 4, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: color, borderRadius: 4,
          transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ fontSize: 12, color: '#e2e8f0', minWidth: 24, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [gameStats, setGameStats] = useState<GameStatsData | null>(null);
  const [gameDays, setGameDays] = useState(30);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.get('/api/admin/stats')
      .then(r => setStats(r.data))
      .catch(() => setError('Eroare la incarcarea statisticilor'));
  }, []);

  useEffect(() => {
    adminApi.get(`/api/admin/stats/games-per-day?days=${gameDays}`)
      .then(r => setGameStats(r.data))
      .catch(() => {/* non-critical */});
  }, [gameDays]);

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        Dashboard
      </h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>
        Bun venit în panoul de administrare Integrame
      </p>

      {error && (
        <div style={{
          background: '#2d1515', border: '1px solid #7f1d1d',
          borderRadius: 8, padding: '12px 16px', color: '#fca5a5',
          marginBottom: 20, fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {!stats ? (
        <p style={{ color: '#64748b' }}>Se încarcă...</p>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 40 }}>
          <StatCard label="Utilizatori totali" value={stats.totalUsers} icon="👥" color="#7c3aed" />
          <StatCard label="Useri noi (7 zile)" value={stats.recentUsers} icon="✨" color="#06b6d4" />
          <StatCard label="Meciuri totale" value={stats.totalMatches} icon="🎮" color="#10b981" />
          <StatCard label="Meciuri active" value={stats.activeMatches} icon="🔥" color="#f59e0b" />
          <StatCard label="Invite codes" value={stats.totalInvites} icon="🎫" color="#ec4899" />
        </div>
      )}

      {/* ── Statistici meciuri pe joc / zi ────────────────────────────── */}
      <div style={{
        background: '#1a1d27', border: '1px solid #2d3748',
        borderRadius: 12, padding: '24px', marginBottom: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600, margin: 0 }}>
            📊 Meciuri finalizate pe joc / zi
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setGameDays(d)} style={{
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                fontWeight: 600, border: 'none',
                background: gameDays === d ? '#7c3aed' : '#2d3748',
                color: gameDays === d ? '#fff' : '#94a3b8',
              }}>
                {d}z
              </button>
            ))}
          </div>
        </div>

        {!gameStats ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Se încarcă statisticile...</p>
        ) : gameStats.data.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 14 }}>Nu există meciuri finalizate în această perioadă.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              {gameStats.gameTypes.map(gt => (
                <div key={gt} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: gameColor(gt) }} />
                  <span style={{ fontSize: 13, color: '#cbd5e1', textTransform: 'capitalize' }}>{gt}</span>
                </div>
              ))}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: '#64748b', padding: '6px 12px 6px 0', fontWeight: 600, borderBottom: '1px solid #2d3748', whiteSpace: 'nowrap' }}>
                    Data
                  </th>
                  {gameStats.gameTypes.map(gt => (
                    <th key={gt} style={{
                      textAlign: 'left', padding: '6px 12px', fontWeight: 600,
                      borderBottom: '1px solid #2d3748', whiteSpace: 'nowrap',
                      color: gameColor(gt), textTransform: 'capitalize',
                    }}>
                      {gt}
                    </th>
                  ))}
                  <th style={{ textAlign: 'left', color: '#64748b', padding: '6px 12px', fontWeight: 600, borderBottom: '1px solid #2d3748' }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxTotal = Math.max(...gameStats.data.map(row =>
                    gameStats.gameTypes.reduce((s, gt) => s + (Number(row[gt]) || 0), 0)
                  ), 1);
                  return [...gameStats.data].reverse().map((row) => {
                    const total = gameStats.gameTypes.reduce((s, gt) => s + (Number(row[gt]) || 0), 0);
                    return (
                      <tr key={row.date} style={{ borderBottom: '1px solid #1e2433' }}>
                        <td style={{ padding: '8px 12px 8px 0', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {row.date}
                        </td>
                        {gameStats.gameTypes.map(gt => (
                          <td key={gt} style={{ padding: '8px 12px', minWidth: 120 }}>
                            <MiniBar value={Number(row[gt]) || 0} max={maxTotal} color={gameColor(gt)} />
                          </td>
                        ))}
                        <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 700 }}>
                          {total}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{
        background: '#1a1d27', border: '1px solid #2d3748',
        borderRadius: 12, padding: '24px',
      }}>
        <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Acțiuni rapide
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { href: '/admin/games', label: '🕹️ Gestionează jocuri' },
            { href: '/admin/simulated-players', label: '🤖 Simulated AI' },
            { href: '/admin/users', label: '👥 Vezi utilizatori' },
            { href: '/admin/matches', label: '🎮 Meciuri active' },
            { href: '/admin/invites', label: '🎫 Gestionează invites' },
            { href: '/admin/logs', label: '📋 Vizualizează loguri' },
          ].map(({ href, label }) => (
            <a key={href} href={href} style={{
              padding: '10px 16px', background: '#2d3748', color: '#e2e8f0',
              borderRadius: 8, textDecoration: 'none', fontSize: 14,
              fontWeight: 500, transition: 'background 0.15s',
            }}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
