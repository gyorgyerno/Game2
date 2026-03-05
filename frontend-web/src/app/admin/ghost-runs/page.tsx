'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { cleanupGhostRuns, deleteGhostRun, GhostRunRecord, listGhostRuns } from '@/lib/adminApi';

export default function AdminGhostRunsPage() {
  const [runs, setRuns] = useState<GhostRunRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [gameType, setGameType] = useState('');
  const [olderThanDays, setOlderThanDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [busyCleanup, setBusyCleanup] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 20)), [total]);

  const toast = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const load = async (targetPage = page, targetSearch = search, targetGameType = gameType) => {
    setLoading(true);
    setError('');
    try {
      const data = await listGhostRuns({
        page: targetPage,
        limit: 20,
        search: targetSearch.trim() || undefined,
        gameType: targetGameType.trim() || undefined,
      });
      setRuns(data.runs);
      setTotal(data.total);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-au putut încărca ghost runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page, search, gameType);
  }, [page]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    load(1, search, gameType);
  };

  const onDelete = async (id: string) => {
    setBusyDeleteId(id);
    setError('');
    try {
      await deleteGhostRun(id);
      toast('Ghost run șters');
      load(page, search, gameType);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-a putut șterge ghost run');
    } finally {
      setBusyDeleteId(null);
    }
  };

  const onCleanup = async () => {
    setBusyCleanup(true);
    setError('');
    try {
      const result = await cleanupGhostRuns({
        gameType: gameType.trim() || undefined,
        olderThanDays,
      });
      toast(`Cleanup finalizat (${result.deletedCount} șterse)`);
      setPage(1);
      load(1, search, gameType);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Nu s-a putut face cleanup');
    } finally {
      setBusyCleanup(false);
    }
  };

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        👻 Ghost Runs
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Management pentru replay-uri ghost: listare, filtrare, cleanup.
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

      <section style={{
        background: '#1a1d27', border: '1px solid #2d3748',
        borderRadius: 12, padding: 20, marginBottom: 20,
      }}>
        <form onSubmit={onSearch} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută username/email"
            style={{
              padding: '8px 10px', minWidth: 220, background: '#0f1117',
              border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
            }}
          />
          <input
            value={gameType}
            onChange={(e) => setGameType(e.target.value)}
            placeholder="Filtru gameType (ex: integrame)"
            style={{
              padding: '8px 10px', minWidth: 220, background: '#0f1117',
              border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
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

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <label style={{ color: '#94a3b8', fontSize: 13 }}>
            Cleanup mai vechi de (zile)
            <input
              type="number"
              min={0}
              max={3650}
              value={olderThanDays}
              onChange={(e) => setOlderThanDays(Number(e.target.value))}
              style={{
                marginLeft: 8, width: 90, padding: '7px 8px', background: '#0f1117',
                border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
              }}
            />
          </label>
          <button
            onClick={onCleanup}
            disabled={busyCleanup}
            style={{
              padding: '8px 12px', background: busyCleanup ? '#4b5563' : '#b45309', color: '#fff',
              border: 'none', borderRadius: 8, cursor: busyCleanup ? 'not-allowed' : 'pointer',
            }}
          >
            {busyCleanup ? 'Se rulează...' : 'Cleanup'}
          </button>
        </div>
      </section>

      <section style={{
        background: '#1a1d27', border: '1px solid #2d3748',
        borderRadius: 12, padding: 20,
      }}>
        <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Ghost runs ({total})
        </h2>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#0f1117', color: '#64748b' }}>
                {['Player', 'Game', 'Difficulty', 'Score', 'Time', 'Mistakes', 'Created', 'Acțiune'].map((head) => (
                  <th key={head} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Se încarcă...</td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Nu există ghost runs pe filtrul curent</td>
                </tr>
              ) : runs.map((run, idx) => {
                const disabled = busyDeleteId === run.id;
                return (
                  <tr key={run.id} style={{ borderTop: '1px solid #1e2433', background: idx % 2 ? '#141720' : 'transparent' }}>
                    <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{run.player.username}</td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{run.gameType}</td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{run.difficulty}</td>
                    <td style={{ padding: '10px 12px', color: '#a78bfa', fontWeight: 600 }}>{run.finalScore}</td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{Math.round(run.completionTime)}s</td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{run.mistakes}/{run.corrections}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{new Date(run.createdAt).toLocaleString('ro-RO')}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        onClick={() => onDelete(run.id)}
                        disabled={disabled}
                        style={{
                          padding: '7px 10px', background: disabled ? '#4b5563' : '#7f1d1d', color: '#fff',
                          border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12,
                        }}
                      >
                        {disabled ? '...' : 'Șterge'}
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
    </div>
  );
}
