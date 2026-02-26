'use client';

import { useEffect, useState } from 'react';
import adminApi from '@/lib/adminApi';

interface MatchPlayer {
  score: number;
  position: number | null;
  user: { username: string; avatarUrl: string | null };
}

interface Match {
  id: string;
  gameType: string;
  level: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  players: MatchPlayer[];
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  waiting:   { bg: '#1e3a5f', color: '#93c5fd' },
  countdown: { bg: '#1e3a1e', color: '#86efac' },
  active:    { bg: '#2d1a00', color: '#fcd34d' },
  finished:  { bg: '#1e1e1e', color: '#64748b' },
};

export default function AdminMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (p = page, s = statusFilter) => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/api/admin/matches', {
        params: { page: p, status: s },
      });
      setMatches(data.matches);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, marginBottom: 24 }}>
        🎮 Meciuri ({total})
      </h1>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['', 'waiting', 'countdown', 'active', 'finished'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
            background: statusFilter === s ? '#7c3aed' : '#1a1d27',
            color: statusFilter === s ? '#fff' : '#94a3b8',
            border: `1px solid ${statusFilter === s ? '#7c3aed' : '#2d3748'}`,
          }}>
            {s === '' ? 'Toate' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <p style={{ color: '#64748b' }}>Se încarcă...</p>
        ) : matches.map(m => {
          const sc = STATUS_COLORS[m.status] || STATUS_COLORS.finished;
          return (
            <div key={m.id} style={{
              background: '#1a1d27', border: '1px solid #2d3748',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      background: sc.bg, color: sc.color, padding: '3px 10px',
                      borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                    }}>
                      {m.status}
                    </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{m.gameType}</span>
                    <span style={{ color: '#64748b', fontSize: 13 }}>Niv. {m.level}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    ID: {m.id.substring(0, 8)}... &nbsp;|&nbsp;
                    Creeat: {new Date(m.createdAt).toLocaleString('ro-RO')}
                    {m.finishedAt && ` | Terminat: ${new Date(m.finishedAt).toLocaleString('ro-RO')}`}
                  </div>
                </div>
                <div style={{ color: '#64748b', fontSize: 13 }}>
                  {m.players.length} jucători
                </div>
              </div>

              {m.players.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {m.players.map((p, idx) => (
                    <div key={idx} style={{
                      background: '#0f1117', borderRadius: 8, padding: '6px 12px',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      {p.position === 1 && <span>🥇</span>}
                      {p.position === 2 && <span>🥈</span>}
                      {p.position === 3 && <span>🥉</span>}
                      <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
                        {p.user.username}
                      </span>
                      {m.status === 'finished' && (
                        <span style={{ color: '#a78bfa', fontSize: 12 }}>{p.score}p</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && matches.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>
          Niciun meci găsit
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'center' }}>
        {Array.from({ length: Math.ceil(total / 20) }, (_, i) => i + 1).map(p => (
          <button key={p} onClick={() => setPage(p)} style={{
            padding: '6px 12px', background: p === page ? '#7c3aed' : '#1a1d27',
            color: p === page ? '#fff' : '#94a3b8', border: '1px solid #2d3748',
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
