'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import adminApi from '@/lib/adminApi';

interface MatchPlayer {
  score: number;
  position: number | null;
  user: { username: string; avatarUrl: string | null; userType: string };
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

interface CleanupPreview {
  count: number;
  oldestDate: string | null;
  cutoffDate: string;
  olderThanDays: number;
  statuses: string[];
}

interface MatchStats {
  todayTotal: number;
  todayFinished: number;
  todayAbandoned: number;
  activeNow: number;
  waitingNow: number;
  abandonRate: number;
}

interface StuckData {
  stuckActive: Match[];
  stuckWaiting: Match[];
  totalStuck: number;
}

const RETENTION_OPTIONS = [3, 5, 7, 14, 30, 60, 90];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  waiting:   { bg: '#1e3a5f', color: '#93c5fd' },
  countdown: { bg: '#1e3a1e', color: '#86efac' },
  active:    { bg: '#2d1a00', color: '#fcd34d' },
  finished:  { bg: '#1e1e1e', color: '#64748b' },
  abandoned: { bg: '#3b1515', color: '#fca5a5' },
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmtDuration(from: string | null, to: string | null): string | null {
  if (!from) return null;
  const end = to ? new Date(to) : new Date();
  const s = Math.floor((end.getTime() - new Date(from).getTime()) / 1000);
  if (s < 0) return null;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ─── Windowed Paginator ───────────────────────────────────────────────────────
function Paginator({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: (number | '…')[] = [];
  if (totalPages <= 9) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 4) pages.push('…');
    for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) pages.push(i);
    if (page < totalPages - 3) pages.push('…');
    pages.push(totalPages);
  }

  const btnBase: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    border: '1px solid #2d3748', minWidth: 36, textAlign: 'center',
  };

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        style={{ ...btnBase, background: '#1a1d27', color: '#94a3b8', opacity: page === 1 ? 0.4 : 1 }}>←</button>
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} style={{ padding: '6px 4px', color: '#475569', fontSize: 13 }}>…</span>
          : <button key={p} onClick={() => onChange(p as number)} style={{
              ...btnBase,
              background: p === page ? '#7c3aed' : '#1a1d27',
              color: p === page ? '#fff' : '#94a3b8',
              border: `1px solid ${p === page ? '#7c3aed' : '#2d3748'}`,
              cursor: p === page ? 'default' : 'pointer',
            }}>{p}</button>
      )}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
        style={{ ...btnBase, background: '#1a1d27', color: '#94a3b8', opacity: page === totalPages ? 0.4 : 1 }}>→</button>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar() {
  const [stats, setStats] = useState<MatchStats | null>(null);

  useEffect(() => {
    const load = () => adminApi.get<MatchStats>('/api/admin/matches/stats')
      .then(r => setStats(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!stats) return null;

  const items: { label: string; value: string | number; color?: string; warn?: boolean }[] = [
    { label: 'Azi total', value: stats.todayTotal.toLocaleString('ro-RO'), color: '#e2e8f0' },
    { label: 'Finalizate azi', value: stats.todayFinished.toLocaleString('ro-RO'), color: '#86efac' },
    { label: 'Abandonate azi', value: stats.todayAbandoned.toLocaleString('ro-RO'), color: stats.todayAbandoned > 0 ? '#fca5a5' : '#64748b' },
    { label: 'Rata abandon', value: `${stats.abandonRate}%`, color: stats.abandonRate > 20 ? '#f87171' : stats.abandonRate > 10 ? '#fcd34d' : '#86efac', warn: stats.abandonRate > 20 },
    { label: 'Active acum', value: stats.activeNow, color: '#fcd34d' },
    { label: 'În așteptare', value: stats.waitingNow, color: '#93c5fd' },
  ];

  return (
    <div style={{
      display: 'flex', gap: 1, marginBottom: 28, flexWrap: 'wrap',
      background: '#0f1117', borderRadius: 12, overflow: 'hidden',
      border: '1px solid #1e2433',
    }}>
      {items.map((item, i) => (
        <div key={i} style={{
          flex: '1 1 0', minWidth: 100, padding: '14px 18px',
          borderRight: i < items.length - 1 ? '1px solid #1e2433' : 'none',
          background: item.warn ? '#1a0f0f' : '#0f1117',
        }}>
          <div style={{ color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>
            {item.label.toUpperCase()}
          </div>
          <div style={{ color: item.color ?? '#e2e8f0', fontSize: 22, fontWeight: 700 }}>
            {item.value}
            {item.warn && <span style={{ fontSize: 14, marginLeft: 6 }}>⚠️</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Stuck Matches Panel ──────────────────────────────────────────────────────
function StuckPanel({ onResolved }: { onResolved: () => void }) {
  const [data, setData] = useState<StuckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await adminApi.get<StuckData>('/api/admin/matches/stuck');
      setData(d);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return null;
  if (data.totalStuck === 0) return null;

  const allMatches = [...data.stuckActive, ...data.stuckWaiting];
  const allSelected = allMatches.length > 0 && allMatches.every(m => selected.has(m.id));

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allMatches.map(m => m.id)));
    }
  };

  const forceAbandon = async () => {
    if (selected.size === 0) return;
    setWorking(true);
    try {
      const { data: r } = await adminApi.post<{ updatedCount: number }>('/api/admin/matches/stuck/force-abandon', {
        ids: [...selected],
      });
      setMsg(`${r.updatedCount} meciuri marcate abandoned`);
      setTimeout(() => setMsg(null), 5000);
      await load();
      onResolved();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div style={{
      background: '#1a0f0f', border: '1px solid #7f1d1d',
      borderRadius: 12, padding: '20px 24px', marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>🔴</span>
        <span style={{ color: '#fca5a5', fontWeight: 700, fontSize: 16 }}>
          Meciuri blocate — {data.totalStuck}
        </span>
        {data.stuckActive.length > 0 && (
          <span style={{ fontSize: 11, background: '#3b1515', color: '#fca5a5', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
            {data.stuckActive.length} active &gt;3h
          </span>
        )}
        {data.stuckWaiting.length > 0 && (
          <span style={{ fontSize: 11, background: '#1e2533', color: '#93c5fd', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
            {data.stuckWaiting.length} în așteptare &gt;30min
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={toggleAll} style={{
            padding: '6px 14px', background: '#1a1d27', color: '#94a3b8',
            border: '1px solid #2d3748', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          }}>
            {allSelected ? 'Deselectează tot' : 'Selectează tot'}
          </button>
          <button onClick={forceAbandon} disabled={working || selected.size === 0} style={{
            padding: '7px 16px', background: selected.size === 0 ? '#1a1d27' : '#991b1b',
            color: selected.size === 0 ? '#475569' : '#fecaca',
            border: `1px solid ${selected.size === 0 ? '#2d3748' : '#b91c1c'}`,
            borderRadius: 6, cursor: selected.size === 0 ? 'default' : 'pointer',
            fontSize: 12, fontWeight: 600,
            opacity: working ? 0.6 : 1,
          }}>
            {working ? 'Se procesează...' : `⚠️ Force-abandon (${selected.size})`}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allMatches.map(m => {
          const isActive = m.status === 'active';
          const since = isActive ? m.startedAt : m.createdAt;
          const duration = fmtDuration(since, null);
          return (
            <div key={m.id} onClick={() => toggle(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              padding: '10px 14px', borderRadius: 8,
              background: selected.has(m.id) ? '#2a1515' : '#140e0e',
              border: `1px solid ${selected.has(m.id) ? '#b91c1c' : '#3b1515'}`,
              transition: 'all 0.1s',
            }}>
              <span style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                background: selected.has(m.id) ? '#991b1b' : '#1a1d27',
                border: `2px solid ${selected.has(m.id) ? '#fca5a5' : '#475569'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected.has(m.id) && <span style={{ color: '#fca5a5', fontSize: 10 }}>✓</span>}
              </span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                ...STATUS_COLORS[m.status],
              }}>{m.status}</span>
              <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{m.gameType}</span>
              <span style={{ color: '#64748b', fontSize: 12 }}>Niv. {m.level}</span>
              <span style={{ color: '#f87171', fontSize: 12, fontWeight: 600 }}>⏱ {duration}</span>
              <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }}>
                {m.players.map(p => p.user.username).join(' vs ')}
              </span>
            </div>
          );
        })}
      </div>

      {msg && (
        <div style={{ marginTop: 12, background: '#1a2e1a', border: '1px solid #166534', borderRadius: 8, padding: '8px 14px', color: '#86efac', fontSize: 13 }}>
          ✅ {msg}
        </div>
      )}
    </div>
  );
}

// ─── Panou retenție date ──────────────────────────────────────────────────────
function RetentionPanel({ onCleanupDone }: { onCleanupDone: () => void }) {
  const [days, setDays] = useState(30);
  const [statuses, setStatuses] = useState<string[]>(['finished', 'abandoned']);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const resetPreview = () => { setPreview(null); setConfirmOpen(false); };

  const toggleStatus = (s: string) => {
    setStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    resetPreview();
  };

  const fetchPreview = async () => {
    if (statuses.length === 0) return;
    setLoadingPreview(true);
    resetPreview();
    try {
      const { data } = await adminApi.get<CleanupPreview>('/api/admin/matches/cleanup/preview', {
        params: { olderThanDays: days, statuses: statuses.join(',') },
      });
      setPreview(data);
    } finally {
      setLoadingPreview(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const { data } = await adminApi.delete<{ deletedCount: number }>('/api/admin/matches/cleanup', {
        data: { olderThanDays: days, statuses },
      });
      setResultMsg(`${data.deletedCount.toLocaleString('ro-RO')} meciuri șterse cu succes`);
      setPreview(null);
      setConfirmOpen(false);
      onCleanupDone();
      setTimeout(() => setResultMsg(null), 6000);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{
      background: '#12141e', border: '1px solid #2d3748',
      borderRadius: 12, padding: '20px 24px', marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>🗑️</span>
        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 16 }}>Curățare date vechi</span>
        <span style={{ fontSize: 11, background: '#1e3a5f', color: '#93c5fd', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>RETENȚIE</span>
      </div>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>PĂSTREAZĂ ULTIMELE</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {RETENTION_OPTIONS.map(d => (
              <button key={d} onClick={() => { setDays(d); resetPreview(); }} style={{
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: days === d ? '#7c3aed' : '#1a1d27',
                color: days === d ? '#fff' : '#94a3b8',
                border: `1px solid ${days === d ? '#7c3aed' : '#2d3748'}`,
              }}>{d}z</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>STATUSURI DE ȘTERS</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['finished', 'abandoned'] as const).map(s => {
              const checked = statuses.includes(s);
              const accent = s === 'abandoned' ? '#fca5a5' : '#93c5fd';
              const accentBg = s === 'abandoned' ? '#3b1515' : '#1e2533';
              const accentBorder = s === 'abandoned' ? '#7f1d1d' : '#2d4a7a';
              return (
                <button key={s} onClick={() => toggleStatus(s)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  padding: '7px 14px', borderRadius: 8,
                  background: checked ? accentBg : '#1a1d27',
                  border: `1px solid ${checked ? accentBorder : '#2d3748'}`,
                  color: checked ? accent : '#64748b',
                  fontSize: 13, fontWeight: 500, userSelect: 'none',
                }}>
                  <span style={{
                    width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                    background: checked ? accentBg : '#0f1117',
                    border: `2px solid ${checked ? accent : '#475569'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <span style={{ color: accent, fontSize: 10, lineHeight: 1 }}>✓</span>}
                  </span>
                  {s}
                </button>
              );
            })}
          </div>
          <div style={{ color: '#374151', fontSize: 11, marginTop: 6 }}>⚠️ waiting / active / countdown nu pot fi șterse</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 200 }}>
          <button onClick={fetchPreview} disabled={loadingPreview || statuses.length === 0} style={{
            padding: '9px 20px', background: '#1e3a5f', color: '#93c5fd',
            border: '1px solid #1e4a8a', borderRadius: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            opacity: loadingPreview || statuses.length === 0 ? 0.5 : 1,
          }}>
            {loadingPreview ? 'Se calculează...' : '🔍 Previzualizare'}
          </button>

          {preview !== null && (
            <div style={{
              background: preview.count === 0 ? '#1a2e1a' : '#2a1a0a',
              border: `1px solid ${preview.count === 0 ? '#166534' : '#92400e'}`,
              borderRadius: 8, padding: '12px 16px',
            }}>
              {preview.count === 0 ? (
                <div style={{ color: '#86efac', fontSize: 13 }}>✅ Niciun meci de șters — baza de date e curată.</div>
              ) : (
                <>
                  <div style={{ color: '#fcd34d', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                    {preview.count.toLocaleString('ro-RO')} meciuri vor fi șterse
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>
                    Cel mai vechi: {preview.oldestDate ? new Date(preview.oldestDate).toLocaleDateString('ro-RO') : '—'}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
                    Până la: {new Date(preview.cutoffDate).toLocaleDateString('ro-RO')}
                  </div>
                  {!confirmOpen ? (
                    <button onClick={() => setConfirmOpen(true)} style={{
                      padding: '8px 16px', background: '#7f1d1d', color: '#fca5a5',
                      border: '1px solid #991b1b', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>
                      🗑️ Șterge {preview.count.toLocaleString('ro-RO')} meciuri
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600 }}>Ești sigur?</span>
                      <button onClick={doDelete} disabled={deleting} style={{
                        padding: '8px 16px', background: '#991b1b', color: '#fecaca',
                        border: '1px solid #b91c1c', borderRadius: 6, cursor: 'pointer',
                        fontSize: 13, fontWeight: 700, opacity: deleting ? 0.6 : 1,
                      }}>
                        {deleting ? 'Se șterge...' : '⚠️ Confirmare ștergere'}
                      </button>
                      <button onClick={() => setConfirmOpen(false)} disabled={deleting} style={{
                        padding: '8px 14px', background: '#1a1d27', color: '#94a3b8',
                        border: '1px solid #2d3748', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                      }}>Anulează</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {resultMsg && (
        <div style={{ marginTop: 16, background: '#1a2e1a', border: '1px solid #166534', borderRadius: 8, padding: '10px 16px', color: '#86efac', fontSize: 14 }}>
          ✅ {resultMsg}
        </div>
      )}
    </div>
  );
}

// ─── Pagina principală ────────────────────────────────────────────────────────
export default function AdminMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [gameTypeOptions, setGameTypeOptions] = useState<string[]>([]);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [gameTypeFilter, setGameTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, s: string, gt: string, q: string) => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/api/admin/matches', {
        params: { page: p, status: s, gameType: gt, search: q },
      });
      setMatches(data.matches);
      setTotal(data.total);
      setTotalPages(data.totalPages ?? Math.ceil(data.total / 20));
      if (data.gameTypes && data.gameTypes.length > 0) {
        setGameTypeOptions(data.gameTypes);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, statusFilter, gameTypeFilter, search); }, [page, statusFilter, gameTypeFilter, search, load]);

  const handleStatusFilter = (s: string) => { setStatusFilter(s); setPage(1); };
  const handleGameTypeFilter = (gt: string) => { setGameTypeFilter(gt); setPage(1); };

  const handleSearchInput = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val.trim());
      setPage(1);
    }, 400);
  };

  const reload = () => load(1, statusFilter, gameTypeFilter, search);

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, marginBottom: 24 }}>
        🎮 Meciuri ({total.toLocaleString('ro-RO')})
      </h1>

      <StatsBar />
      <StuckPanel onResolved={reload} />
      <RetentionPanel onCleanupDone={() => { setPage(1); load(1, statusFilter, gameTypeFilter, search); }} />

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['', 'waiting', 'countdown', 'active', 'finished', 'abandoned'].map(s => (
            <button key={s} onClick={() => handleStatusFilter(s)} style={{
              padding: '7px 15px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
              background: statusFilter === s ? '#7c3aed' : '#1a1d27',
              color: statusFilter === s ? '#fff' : '#94a3b8',
              border: `1px solid ${statusFilter === s ? '#7c3aed' : '#2d3748'}`,
            }}>
              {s === '' ? 'Toate' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* GameType dropdown */}
        {gameTypeOptions.length > 0 && (
          <select value={gameTypeFilter} onChange={e => handleGameTypeFilter(e.target.value)} style={{
            padding: '7px 12px', background: '#1a1d27', color: gameTypeFilter ? '#e2e8f0' : '#64748b',
            border: `1px solid ${gameTypeFilter ? '#7c3aed' : '#2d3748'}`, borderRadius: 8,
            fontSize: 13, cursor: 'pointer',
          }}>
            <option value=''>Toate jocurile</option>
            {gameTypeOptions.map(gt => <option key={gt} value={gt}>{gt}</option>)}
          </select>
        )}

        {/* Search */}
        <input
          value={searchInput}
          onChange={e => handleSearchInput(e.target.value)}
          placeholder='Caută după username...'
          style={{
            flex: '1 1 180px', maxWidth: 280, padding: '7px 12px',
            background: '#1a1d27', border: `1px solid ${search ? '#7c3aed' : '#2d3748'}`,
            borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} style={{
            padding: '7px 12px', background: '#1a1d27', color: '#94a3b8',
            border: '1px solid #2d3748', borderRadius: 8, cursor: 'pointer', fontSize: 13,
          }}>✕ Resetează</button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <p style={{ color: '#64748b' }}>Se încarcă...</p>
        ) : matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>Niciun meci găsit</div>
        ) : matches.map(m => {
          const sc = STATUS_COLORS[m.status] || STATUS_COLORS.finished;
          const dur = m.status === 'active'
            ? fmtDuration(m.startedAt, null)
            : fmtDuration(m.startedAt, m.finishedAt);
          const realPlayers = m.players.filter(p => p.user.userType === 'REAL');
          const botPlayers = m.players.filter(p => p.user.userType !== 'REAL');

          return (
            <div key={m.id} style={{
              background: '#1a1d27', border: '1px solid #2d3748',
              borderRadius: 12, padding: '14px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span style={{
                      background: sc.bg, color: sc.color, padding: '2px 9px',
                      borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    }}>{m.status}</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{m.gameType}</span>
                    <span style={{ color: '#64748b', fontSize: 13 }}>Niv. {m.level}</span>
                    {dur && (
                      <span style={{
                        fontSize: 12, color: m.status === 'active' ? '#fcd34d' : '#475569',
                        background: '#0f1117', padding: '1px 8px', borderRadius: 10,
                      }}>⏱ {dur}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#374151' }}>
                    ID: {m.id.substring(0, 8)}... · {new Date(m.createdAt).toLocaleString('ro-RO')}
                    {m.finishedAt && ` → ${new Date(m.finishedAt).toLocaleString('ro-RO')}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {botPlayers.length > 0 && (
                    <span style={{ fontSize: 11, color: '#64748b', background: '#0f1117', padding: '2px 8px', borderRadius: 10 }}>
                      🤖 {botPlayers.length}
                    </span>
                  )}
                  <span style={{ color: '#64748b', fontSize: 13 }}>{m.players.length} jucători</span>
                </div>
              </div>

              {m.players.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {m.players.map((p, idx) => (
                    <div key={idx} style={{
                      background: '#0f1117', borderRadius: 8, padding: '5px 11px',
                      display: 'flex', alignItems: 'center', gap: 6,
                      opacity: p.user.userType !== 'REAL' ? 0.6 : 1,
                    }}>
                      {p.position === 1 && <span>🥇</span>}
                      {p.position === 2 && <span>🥈</span>}
                      {p.position === 3 && <span>🥉</span>}
                      {p.user.userType === 'SIMULATED' && <span style={{ fontSize: 11 }}>🤖</span>}
                      {p.user.userType === 'GHOST' && <span style={{ fontSize: 11 }}>👻</span>}
                      <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{p.user.username}</span>
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

      <Paginator page={page} totalPages={totalPages} onChange={p => setPage(p)} />
    </div>
  );
}
