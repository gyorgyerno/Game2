'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/games', label: 'Jocuri', icon: '🕹️' },
  { href: '/admin/simulated-players', label: 'Simulated AI', icon: '🤖' },
  { href: '/admin/users', label: 'Utilizatori', icon: '👥' },
  { href: '/admin/matches', label: 'Meciuri', icon: '🎮' },
  { href: '/admin/invites', label: 'Invite Codes', icon: '🎫' },
  { href: '/admin/logs', label: 'Loguri', icon: '📋' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === '/admin/login') return;
    const token = localStorage.getItem('adminToken');
    const username = localStorage.getItem('adminUsername');
    if (!token) {
      router.push('/admin/login');
    } else {
      setAdmin(username);
    }
  }, [pathname, router]);

  const logout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    router.push('/admin/login');
  };

  if (pathname === '/admin/login') return <>{children}</>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: '#1a1d27', borderRight: '1px solid #2d3748',
        display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #2d3748' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed' }}>⚡ Integrame</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Admin Panel</div>
        </div>

        <nav style={{ flex: 1, padding: '16px 0' }}>
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
            return (
              <Link key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px', textDecoration: 'none',
                color: active ? '#a78bfa' : '#94a3b8',
                background: active ? '#2d2a3e' : 'transparent',
                borderRight: active ? '3px solid #7c3aed' : '3px solid transparent',
                fontWeight: active ? 600 : 400, fontSize: 14,
                transition: 'all 0.15s',
              }}>
                <span>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #2d3748' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            👤 {admin || 'Admin'}
          </div>
          <button onClick={logout} style={{
            width: '100%', padding: '8px', background: '#2d3748', color: '#e2e8f0',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: '32px', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
