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

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.get('/api/admin/stats')
      .then(r => setStats(r.data))
      .catch(() => setError('Eroare la incarcarea statisticilor'));
  }, []);

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

      <div style={{
        background: '#1a1d27', border: '1px solid #2d3748',
        borderRadius: 12, padding: '24px',
      }}>
        <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Acțiuni rapide
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
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
