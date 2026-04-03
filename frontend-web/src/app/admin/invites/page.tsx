'use client';

import { useEffect, useState } from 'react';
import adminApi from '@/lib/adminApi';
import { Paginator } from '@/components/admin/Paginator';

interface Invite {
  id: string;
  code: string;
  gameType: string;
  level: number;
  maxUses: number;
  usedBy: string;
  expiresAt: string;
  createdAt: string;
  creator: { username: string; email: string };
}

export default function AdminInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ gameType: 'integrame', level: 1, maxUses: 10, createdBy: '' });
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/api/admin/invites', { params: { page: p } });
      setInvites(data.invites);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data } = await adminApi.get('/api/admin/users', { params: { limit: 100 } });
      setUsers(data.users);
    } catch {
      // best-effort, not critical
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page]);

  const err = (text: string) => {
    setErrMsg(text);
    setTimeout(() => setErrMsg(''), 3000);
  };

  const msg = (text: string) => {
    setActionMsg(text);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.post('/api/admin/invites', form);
      setShowCreate(false);
      msg('Invite creat cu succes');
      load();
    } catch {
      err('Eroare la creare invite');
    }
  };

  const deleteInvite = async (id: string) => {
    try {
      await adminApi.delete(`/api/admin/invites/${id}`);
      msg('Invite șters');
      load();
    } catch {
      err('Eroare la ștergere invite');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    msg(`Cod copiat: ${code}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700 }}>
          🎫 Invite Codes ({total})
        </h1>
        <button
          onClick={() => { setShowCreate(true); loadUsers(); }}
          style={{
            padding: '10px 20px', background: '#7c3aed', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
          }}
        >
          + Crează invite
        </button>
      </div>

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

      <div style={{ background: '#1a1d27', border: '1px solid #2d3748', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#0f1117', color: '#64748b' }}>
              {['Cod', 'Tip joc', 'Nivel', 'Utilizări', 'Expiră', 'Creat de', 'Acțiuni'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Se încarcă...</td></tr>
            ) : invites.map((inv, i) => {
              const usedCount = (() => { try { return JSON.parse(inv.usedBy).length; } catch { return 0; } })();
              const expired = new Date(inv.expiresAt) < new Date();
              return (
                <tr key={inv.id} style={{ borderTop: '1px solid #1e2433', background: i % 2 === 0 ? 'transparent' : '#141720' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontFamily: 'monospace', background: '#2d3748', padding: '4px 10px',
                      borderRadius: 6, color: '#a78bfa', fontWeight: 700, letterSpacing: 1,
                    }}>
                      {inv.code}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{inv.gameType}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>Niv. {inv.level}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ color: usedCount >= inv.maxUses ? '#f87171' : '#86efac' }}>
                      {usedCount}/{inv.maxUses}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: expired ? '#f87171' : '#64748b' }}>
                    {expired ? '⛔ Expirat' : new Date(inv.expiresAt).toLocaleDateString('ro-RO')}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{inv.creator?.username}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => copyCode(inv.code)} style={{
                        padding: '5px 10px', background: '#1e3a5f', color: '#93c5fd',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      }}>
                        Copiază
                      </button>
                      <button onClick={() => deleteInvite(inv.id)} style={{
                        padding: '5px 10px', background: '#3b1515', color: '#fca5a5',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      }}>
                        Șterge
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Paginator page={page} totalPages={Math.ceil(total / 20)} onChange={setPage} />

      {/* Create Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: '#00000080',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#1a1d27', border: '1px solid #2d3748',
            borderRadius: 12, padding: 32, maxWidth: 420, width: '100%',
          }}>
            <h3 style={{ color: '#e2e8f0', marginBottom: 24, fontSize: 18, fontWeight: 600 }}>
              Crează invite code
            </h3>
            <form onSubmit={createInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Tip joc</label>
                <input
                  value={form.gameType}
                  onChange={e => setForm(f => ({ ...f, gameType: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Nivel</label>
                <input
                  type="number" min={1} max={10}
                  value={form.level}
                  onChange={e => setForm(f => ({ ...f, level: parseInt(e.target.value) }))}
                  style={{ width: '100%', padding: '10px 12px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Utilizări maxime</label>
                <input
                  type="number" min={1}
                  value={form.maxUses}
                  onChange={e => setForm(f => ({ ...f, maxUses: parseInt(e.target.value) }))}
                  style={{ width: '100%', padding: '10px 12px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>Creat de (user)</label>
                <select
                  required
                  value={form.createdBy}
                  onChange={e => setForm(f => ({ ...f, createdBy: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', background: '#0f1117', border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0', fontSize: 14, boxSizing: 'border-box' }}
                >
                  <option value="">— selectează —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{
                  flex: 1, padding: '10px', background: '#2d3748', color: '#e2e8f0',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                }}>
                  Anulează
                </button>
                <button type="submit" style={{
                  flex: 1, padding: '10px', background: '#7c3aed', color: '#fff',
                  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
                }}>
                  Crează
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
