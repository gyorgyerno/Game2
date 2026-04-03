'use client';

import { useEffect, useState, useCallback } from 'react';
import adminApi from '@/lib/adminApi';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Overview {
  period: string;
  users: {
    total: number;
    real: number;
    bots: number;
    ghosts: number;
    newInPeriod: number;
    activePlayers: number;
  };
  matches: {
    total: number;
    solo: number;
    group: number;
    perGame: Record<string, number>;
    perLevel: Record<string, number>;
  };
  players: { soloUnique: number; groupUnique: number };
  perLeague: Record<string, number>;
  topUsers: { username: string; rating: number; league: string; xp: number }[];
  registrationTimeline: { date: string; count: number }[];
  matchTimeline: { date: string; count: number }[];
}

// ─── Types — Peak Hours ─────────────────────────────────────────────────────
interface PeakHoursData {
  hours: { hour: number; count: number }[];
}

// ─── Types — Abandon Stats ───────────────────────────────────────────────────
interface AbandonWindow {
  total: number;
  solo: number;
  multi: number;
  perGame: Record<string, number>;
  perLevel: Record<string, number>;
}
interface AbandonStats {
  windows: { '7d': AbandonWindow; '14d': AbandonWindow; '30d': AbandonWindow };
  topAbandoners: { username: string; count: number }[];
  blockedCount: number;
  timeline: { date: string; count: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIOD_LABELS: Record<string, string> = { day: 'Azi (24h)', week: 'Săptămâna', month: 'Luna' };

const GAME_COLORS: Record<string, string> = {
  integrame: '#7c3aed',
  quiz: '#06b6d4',
  maze: '#10b981',
  labirinturi: '#10b981',
  slogane: '#f59e0b',
};
const gameColor = (g: string) => GAME_COLORS[g] ?? '#ec4899';

const LEAGUE_COLORS: Record<string, string> = {
  bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700',
  platinum: '#e5e4e2', diamond: '#b9f2ff',
};
const LEAGUE_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

// ─── Small helpers ────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#1a1d27', border: '1px solid #2d3748',
      borderRadius: 12, padding: 24, ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 18, marginTop: 0 }}>
      {children}
    </h2>
  );
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: string }) {
  return (
    <div style={{
      background: '#1a1d27', border: `1px solid ${color}33`,
      borderRadius: 12, padding: '20px 24px', flex: '1 1 160px',
    }}>
      <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Mini horizontal bar ─────────────────────────────────────────────────────
function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
        <span style={{ textTransform: 'capitalize' }}>{label}</span>
        <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{value}</span>
      </div>
      <div style={{ height: 8, background: '#0f1117', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

// ─── Sparkline (SVG inline, no deps) ─────────────────────────────────────────
function Sparkline({ data, color, height = 56 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const w = 100;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - 4 - ((v / max) * (height - 8));
    return `${x},${y}`;
  }).join(' ');
  const fill = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - 4 - ((v / max) * (height - 8));
    return `${x},${y}`;
  });
  const fillPath = `M0,${height} L${fill[0]} L${fill.join(' L')} L${w},${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <path d={fillPath} fill={color} fillOpacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

// ─── Peak Hours bar chart (inline SVG, no deps) ─────────────────────────────
function PeakHoursChart({ hours }: { hours: { hour: number; count: number }[] }) {
  const max = Math.max(...hours.map(h => h.count), 1);
  const W = 480, H = 72;
  const barW = Math.floor(W / 24) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', height: H + 20 }} preserveAspectRatio="none">
      {hours.map(({ hour, count }) => {
        const x = (hour / 24) * W + 1;
        const barH = max > 0 ? (count / max) * H : 0;
        return (
          <g key={hour}>
            <rect x={x} y={H - barH} width={barW} height={barH} fill="#7c3aed" rx={2} fillOpacity={count > 0 ? 0.85 : 0.15} />
            {hour % 6 === 0 && (
              <text x={x + barW / 2} y={H + 14} fontSize={8} fill="#64748b" textAnchor="middle">
                {String(hour).padStart(2, '0')}h
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Period selector ─────────────────────────────────────────────────────────
function PeriodBtn({ p, active, onClick }: { p: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13,
      fontWeight: 600, border: 'none',
      background: active ? '#7c3aed' : '#2d3748',
      color: active ? '#fff' : '#94a3b8',
      transition: 'background .15s',
    }}>
      {PERIOD_LABELS[p]}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StatsPage() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [data, setData] = useState<Overview | null>(null);
  const [abandonData, setAbandonData] = useState<AbandonStats | null>(null);
  const [peakHours, setPeakHours] = useState<PeakHoursData | null>(null);
  const [abandonWindow, setAbandonWindow] = useState<'7d' | '14d' | '30d'>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback((p: string) => {
    setLoading(true);
    setError('');
    Promise.all([
      adminApi.get(`/api/admin/stats/overview?period=${p}`),
      adminApi.get('/api/admin/stats/abandon'),
      adminApi.get('/api/admin/stats/peak-hours'),
    ])
      .then(([overviewRes, abandonRes, peakRes]) => {
        setData(overviewRes.data);
        setAbandonData(abandonRes.data);
        setPeakHours(peakRes.data);
      })
      .catch(() => setError('Eroare la încărcarea statisticilor'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, margin: 0 }}>📈 Statistici</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 6, marginBottom: 0 }}>
            Analiză completă a activității platformei
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['day', 'week', 'month'] as const).map(p => (
            <PeriodBtn key={p} p={p} active={period === p} onClick={() => setPeriod(p)} />
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', color: '#fca5a5', marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      {loading || !data ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748b', padding: 48, justifyContent: 'center' }}>
          <div style={{ fontSize: 28 }}>⏳</div> Se încarcă statisticile...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── KPI row ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <KpiCard label="Utilizatori totali" value={data.users.total} icon="👥" color="#7c3aed" sub={`${data.users.real} reali · ${data.users.bots} boți`} />
            <KpiCard label={`Useri noi (${PERIOD_LABELS[period].toLowerCase()})`} value={data.users.newInPeriod} icon="✨" color="#06b6d4" />
            <KpiCard label="Jucători activi" value={data.users.activePlayers} icon="🔥" color="#f59e0b" sub="useri unici cu meci finalizat" />
            <KpiCard label="Meciuri finalizate" value={data.matches.total} icon="🎮" color="#10b981" sub={`${data.matches.solo} solo · ${data.matches.group} grup`} />
            <KpiCard label="Jocuri solo (useri unici)" value={data.players.soloUnique} icon="🧍" color="#a78bfa" />
            <KpiCard label="Jocuri grup (useri unici)" value={data.players.groupUnique} icon="👫" color="#ec4899" />
          </div>

          {/* ── Row 2: Meciuri pe joc + pe nivel ─────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>

            <Card>
              <SectionTitle>🕹️ Meciuri per joc</SectionTitle>
              {Object.keys(data.matches.perGame).length === 0
                ? <p style={{ color: '#475569', fontSize: 14 }}>Nicio activitate în perioada selectată.</p>
                : Object.entries(data.matches.perGame)
                    .sort(([, a], [, b]) => b - a)
                    .map(([game, count]) => (
                      <HBar key={game} label={game} value={count}
                        max={Math.max(...Object.values(data.matches.perGame))}
                        color={gameColor(game)} />
                    ))
              }
            </Card>

            <Card>
              <SectionTitle>📶 Meciuri per nivel</SectionTitle>
              {Object.keys(data.matches.perLevel).length === 0
                ? <p style={{ color: '#475569', fontSize: 14 }}>Nicio activitate în perioada selectată.</p>
                : Object.entries(data.matches.perLevel)
                    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                    .map(([lvl, count]) => (
                      <HBar key={lvl} label={lvl} value={count}
                        max={Math.max(...Object.values(data.matches.perLevel))}
                        color="#7c3aed" />
                    ))
              }
            </Card>

            <Card>
              <SectionTitle>🏆 Distribuție ligi</SectionTitle>
              {LEAGUE_ORDER.map(league => {
                const count = data.perLeague[league] ?? 0;
                const max = Math.max(...Object.values(data.perLeague), 1);
                return (
                  <HBar key={league} label={league} value={count} max={max}
                    color={LEAGUE_COLORS[league] ?? '#94a3b8'} />
                );
              })}
            </Card>

          </div>

          {/* ── Row 3: Trenduri 30 zile ───────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>

            <Card>
              <SectionTitle>📅 Înregistrări noi — ultimele 30 zile</SectionTitle>
              <Sparkline data={data.registrationTimeline.map(r => r.count)} color="#7c3aed" height={72} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginTop: 6 }}>
                <span>{data.registrationTimeline[0]?.date ?? ''}</span>
                <span>{data.registrationTimeline[data.registrationTimeline.length - 1]?.date ?? ''}</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.registrationTimeline.slice(-7).reverse().map(r => (
                  <div key={r.date} style={{
                    background: '#0f1117', borderRadius: 6, padding: '4px 10px',
                    fontSize: 12, color: '#94a3b8',
                  }}>
                    <span style={{ color: '#a78bfa', fontWeight: 700 }}>{r.count}</span>
                    {' '}· {r.date.slice(5)}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle>🎮 Meciuri finalizate — ultimele 30 zile</SectionTitle>
              <Sparkline data={data.matchTimeline.map(r => r.count)} color="#10b981" height={72} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginTop: 6 }}>
                <span>{data.matchTimeline[0]?.date ?? ''}</span>
                <span>{data.matchTimeline[data.matchTimeline.length - 1]?.date ?? ''}</span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.matchTimeline.slice(-7).reverse().map(r => (
                  <div key={r.date} style={{
                    background: '#0f1117', borderRadius: 6, padding: '4px 10px',
                    fontSize: 12, color: '#94a3b8',
                  }}>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>{r.count}</span>
                    {' '}· {r.date.slice(5)}
                  </div>
                ))}
              </div>
            </Card>

          </div>

          {/* ── Row 4: Top useri ──────────────────────────────────────────── */}
          <Card>
            <SectionTitle>🥇 Top 5 jucători după rating</SectionTitle>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ color: '#64748b' }}>
                  {['#', 'Username', 'Rating', 'Ligă', 'XP'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid #2d3748' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.topUsers.map((u, i) => (
                  <tr key={u.username} style={{ borderBottom: '1px solid #1e2433' }}>
                    <td style={{ padding: '10px 14px', color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#64748b', fontWeight: 700 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#e2e8f0', fontWeight: 600 }}>{u.username}</td>
                    <td style={{ padding: '10px 14px', color: '#a78bfa', fontWeight: 700 }}>{u.rating}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: LEAGUE_COLORS[u.league] ?? '#e2e8f0', textTransform: 'capitalize', fontWeight: 500 }}>{u.league}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{u.xp.toLocaleString('ro-RO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* ── Row 5: Tip user breakdown ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            {[
              { label: 'Jucători reali', value: data.users.real, total: data.users.total, color: '#7c3aed', icon: '👤' },
              { label: 'Boți simulați', value: data.users.bots, total: data.users.total, color: '#f59e0b', icon: '🤖' },
              { label: 'Ghost runners', value: data.users.ghosts, total: data.users.total, color: '#64748b', icon: '👻' },
            ].map(({ label, value, total, color, icon }) => {
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <Card key={label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 32 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
                    <div style={{ marginTop: 8, height: 6, background: '#0f1117', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>{pct}% din total</div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* ── Row 6: Peak hours ─────────────────────────────────────────── */}
          {peakHours && (
            <Card>
              <SectionTitle>🕐 Ore de vârf — meciuri finalizate (toate timpurile)</SectionTitle>
              <PeakHoursChart hours={peakHours.hours} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginTop: 4 }}>
                <span>00:00</span>
                <span style={{ textAlign: 'center' }}>ora zilei (UTC)</span>
                <span>23:00</span>
              </div>
              {peakHours.hours.every(h => h.count === 0) && (
                <p style={{ color: '#475569', fontSize: 13, marginTop: 8 }}>Nu există meciuri finalizate înregistrate.</p>
              )}
            </Card>
          )}

          {/* ── Row 7: Abandon stats ───────────────────────────────────────── */}
          {abandonData && (() => {
            const win = abandonData.windows[abandonWindow];
            const maxGame = Math.max(...Object.values(win.perGame), 1);
            const maxLevel = Math.max(...Object.values(win.perLevel), 1);
            return (
              <Card>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                  <SectionTitle>🚫 Statistici Abandon</SectionTitle>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['7d', '14d', '30d'] as const).map(w => (
                      <button key={w} onClick={() => setAbandonWindow(w)} style={{
                        padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: 'none',
                        background: abandonWindow === w ? '#f97316' : '#2d3748',
                        color: abandonWindow === w ? '#fff' : '#94a3b8',
                        transition: 'background .15s',
                      }}>
                        {w === '7d' ? '7 zile' : w === '14d' ? '14 zile' : '30 zile'}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>

                  {/* KPI-uri fereastra selectată */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { label: 'Total abandon-uri', value: win.total, color: '#f97316', icon: '🚫' },
                        { label: 'Solo', value: win.solo, color: '#fb923c', icon: '🎮' },
                        { label: 'Multiplayer', value: win.multi, color: '#ef4444', icon: '👥' },
                      ].map(({ label, value, color, icon }) => (
                        <div key={label} style={{
                          flex: 1, background: '#0f1117', border: `1px solid ${color}33`,
                          borderRadius: 10, padding: '14px 12px', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                          <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{
                      background: '#0f1117', border: '1px solid #ef444433',
                      borderRadius: 10, padding: '14px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>🔒 Useri blocați auto</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Total activi în sistem</div>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: '#ef4444' }}>{abandonData.blockedCount}</div>
                    </div>
                  </div>

                  {/* Per joc + per nivel */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Per joc</div>
                      {Object.keys(win.perGame).length === 0
                        ? <div style={{ color: '#475569', fontSize: 13 }}>Niciun abandon în perioada selectată.</div>
                        : Object.entries(win.perGame).sort(([, a], [, b]) => b - a).map(([game, count]) => (
                          <HBar key={game} label={game} value={count} max={maxGame} color={gameColor(game)} />
                        ))
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Per nivel</div>
                      {Object.keys(win.perLevel).length === 0
                        ? <div style={{ color: '#475569', fontSize: 13 }}>—</div>
                        : Object.entries(win.perLevel).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([lvl, count]) => (
                          <HBar key={lvl} label={lvl} value={count} max={maxLevel} color="#f97316" />
                        ))
                      }
                    </div>
                  </div>

                  {/* Top abandoners + sparkline */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top abandoners — 30 zile</div>
                      {abandonData.topAbandoners.length === 0
                        ? <div style={{ color: '#475569', fontSize: 13 }}>Niciun abandon înregistrat.</div>
                        : abandonData.topAbandoners.map((u, i) => (
                          <div key={u.username} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '7px 0', borderBottom: '1px solid #1e253444',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#475569', fontSize: 12, width: 16 }}>#{i + 1}</span>
                              <span style={{ color: '#e2e8f0', fontSize: 13 }}>{u.username}</span>
                            </div>
                            <span style={{
                              background: '#f9731622', color: '#fb923c',
                              padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                            }}>{u.count}</span>
                          </div>
                        ))
                      }
                    </div>
                    {abandonData.timeline.length > 1 && (
                      <div>
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trend abandon — 30 zile</div>
                        <Sparkline data={abandonData.timeline.map(r => r.count)} color="#f97316" height={56} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 4 }}>
                          <span>{abandonData.timeline[0]?.date.slice(5)}</span>
                          <span>{abandonData.timeline[abandonData.timeline.length - 1]?.date.slice(5)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </Card>
            );
          })()}

        </div>
      )}
    </div>
  );
}
