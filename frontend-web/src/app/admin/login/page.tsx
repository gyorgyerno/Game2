'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import adminApi from '@/lib/adminApi';

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await adminApi.post('/api/admin/login', { username, password });
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUsername', data.username);
      router.push('/admin');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Credentiale invalide');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0f1117',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a1d27', border: '1px solid #2d3748',
        borderRadius: 12, padding: '40px', width: '100%', maxWidth: 380,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
          <h1 style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700, margin: 0 }}>
            Integrame Admin
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>
            Autentifică-te pentru a continua
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>
              Username
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoComplete="username"
              style={{
                width: '100%', padding: '10px 12px', background: '#0f1117',
                border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
                fontSize: 15, boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>
              Parolă
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%', padding: '10px 12px', background: '#0f1117',
                border: '1px solid #2d3748', borderRadius: 8, color: '#e2e8f0',
                fontSize: 15, boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#2d1515', border: '1px solid #7f1d1d',
              borderRadius: 8, padding: '10px 12px', color: '#fca5a5', fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px', background: loading ? '#4c1d95' : '#7c3aed',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 15,
              fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              marginTop: 8, transition: 'background 0.15s',
            }}
          >
            {loading ? 'Se autentifică...' : 'Autentificare'}
          </button>
        </form>
      </div>
    </div>
  );
}
