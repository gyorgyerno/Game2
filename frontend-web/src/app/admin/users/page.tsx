'use client';

import { useEffect, useState } from 'react';
import adminApi from '@/lib/adminApi';

interface User {
  id: string;
  email: string;
  username: string;
  rating: number;
  xp: number;
  league: string;
  createdAt: string;
  _count: { matchPlayers: number };
}

const LEAGUES: Record<string, string> = {
  bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700',
  platinum: '#e5e4e2', diamond: '#b9f2ff',
};

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async (p = page, s = search) => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/api/admin/users', {
        params: { page: p, search: s, limit: 20 },
      });
      setUsers(data.users);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

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

  const resetRating = async (id: string) => {
    await adminApi.patch(`/api/admin/users/${id}/reset-rating`);
    msg('Rating resetat la 1000');
    load();
  };

  const deleteUser = async (id: string) => {
    await adminApi.delete(`/api/admin/users/${id}`);
    setConfirmDelete(null);
    msg('User șters');
    load();
  };

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, marginBottom: 24 }}>
        👥 Utilizatori ({total})
      </h1>

      {actionMsg && (
        <div style={{
          background: '#1a2e1a', border: '1px solid #166534', borderRadius: 8,
          padding: '10px 16px', color: '#86efac', marginBottom: 16, fontSize: 14,
        }}>
          ✅ {actionMsg}
        </div>
      )}

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
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

      <div style={{
        background: '#1a1d27', border: '1px solid #2d3748',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#0f1117', color: '#64748b' }}>
              {['Username', 'Email', 'Rating', 'Liga', 'Meciuri', 'Înregistrat', 'Acțiuni'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Se încarcă...</td></tr>
            ) : users.map((u, i) => (
              <tr key={u.id} style={{ borderTop: '1px solid #1e2433', background: i % 2 === 0 ? 'transparent' : '#141720' }}>
                <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 500 }}>
                  {u.username}
                </td>
                <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{u.email}</td>
                <td style={{ padding: '12px 16px', color: '#a78bfa', fontWeight: 600 }}>{u.rating}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    color: LEAGUES[u.league] || '#e2e8f0',
                    textTransform: 'capitalize', fontWeight: 500,
                  }}>
                    {u.league}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{u._count.matchPlayers}</td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>
                  {new Date(u.createdAt).toLocaleDateString('ro-RO')}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => resetRating(u.id)}
                      title="Reset rating la 1000"
                      style={{
                        padding: '5px 10px', background: '#1e3a5f', color: '#93c5fd',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      Reset elo
                    </button>
                    <button
                      onClick={() => setConfirmDelete(u.id)}
                      style={{
                        padding: '5px 10px', background: '#3b1515', color: '#fca5a5',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
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

      {/* Confirm Delete Modal */}
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
    </div>
  );
}
