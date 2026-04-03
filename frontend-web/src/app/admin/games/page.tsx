'use client';

import { useEffect, useState } from 'react';
import adminApi from '@/lib/adminApi';

interface AdminGame {
  id: string;
  name: string;
  description: string;
  icon?: string;
  isActive: boolean;
  order?: number;
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<AdminGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/api/admin/games');
      setGames(Array.isArray(data?.games) ? data.games : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const err = (text: string) => { setErrMsg(text); setTimeout(() => setErrMsg(''), 3000); };

  const toggle = async (game: AdminGame) => {
    try {
      await adminApi.patch(`/api/admin/games/${game.id}`, { isActive: !game.isActive });
      setMsg(`${game.name} este acum ${!game.isActive ? 'activ' : 'inactiv'}.`);
      setTimeout(() => setMsg(''), 2500);
      load();
    } catch {
      err('Eroare la modificare joc');
    }
  };

  const move = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= games.length) return;

    const current = games[index];
    const target = games[targetIndex];

    const currentOrder = current.order ?? (index + 1) * 10;
    const targetOrder = target.order ?? (targetIndex + 1) * 10;

    try {
      await Promise.all([
        adminApi.patch(`/api/admin/games/${current.id}/order`, { order: targetOrder }),
        adminApi.patch(`/api/admin/games/${target.id}/order`, { order: currentOrder }),
      ]);
      setMsg(`Ordinea a fost actualizată.`);
      setTimeout(() => setMsg(''), 2500);
      load();
    } catch {
      err('Eroare la reordonare');
    }
  };

  return (
    <div>
      <h1 style={{ color: '#e2e8f0', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
        🕹️ Jocuri
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Activează sau dezactivează jocurile afișate în aplicație.
      </p>

      {msg && (
        <div style={{
          background: '#1a2e1a', border: '1px solid #166534', borderRadius: 8,
          padding: '10px 16px', color: '#86efac', marginBottom: 16, fontSize: 14,
        }}>
          ✅ {msg}
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

      <div style={{
        background: '#1a1d27', border: '1px solid #2d3748',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#0f1117', color: '#64748b' }}>
              {['Joc', 'Descriere', 'Ordine', 'Status', 'Acțiune'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Se încarcă...</td></tr>
            ) : games.map((game, idx) => (
              <tr key={game.id} style={{ borderTop: '1px solid #1e2433', background: idx % 2 === 0 ? 'transparent' : '#141720' }}>
                <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 600 }}>
                  <span style={{ marginRight: 8 }}>{game.icon || '🎮'}</span>{game.name}
                </td>
                <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{game.description}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#cbd5e1', fontWeight: 600, minWidth: 28 }}>{game.order ?? (idx + 1) * 10}</span>
                    <button
                      disabled={idx === 0}
                      onClick={() => move(idx, 'up')}
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer',
                        background: idx === 0 ? '#1f2937' : '#1e3a5f', color: idx === 0 ? '#64748b' : '#93c5fd', fontSize: 12,
                      }}
                    >
                      ↑
                    </button>
                    <button
                      disabled={idx === games.length - 1}
                      onClick={() => move(idx, 'down')}
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: 'none', cursor: idx === games.length - 1 ? 'not-allowed' : 'pointer',
                        background: idx === games.length - 1 ? '#1f2937' : '#1e3a5f', color: idx === games.length - 1 ? '#64748b' : '#93c5fd', fontSize: 12,
                      }}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 999,
                    background: game.isActive ? '#16371f' : '#3b1515',
                    color: game.isActive ? '#86efac' : '#fca5a5',
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {game.isActive ? 'Activ' : 'Inactiv'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    onClick={() => toggle(game)}
                    style={{
                      padding: '6px 12px',
                      background: game.isActive ? '#3b1515' : '#1e3a5f',
                      color: game.isActive ? '#fca5a5' : '#93c5fd',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    {game.isActive ? 'Dezactivează' : 'Activează'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
