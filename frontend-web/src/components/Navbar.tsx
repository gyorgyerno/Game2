'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Trophy, LogOut, Home, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState } from 'react';
import { friendsApi } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const leagueLabel = user?.league ? user.league.charAt(0).toUpperCase() + user.league.slice(1) : '';
  const [pendingCount, setPendingCount] = useState(0);

  const navBtn = (active: boolean) =>
    `inline-flex items-center justify-center rounded-xl border px-3 py-1.5 text-sm transition-colors ${
      active
        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
        : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
    }`;

  useEffect(() => {
    if (!user) return;
    const fetch = () => friendsApi.requests().then(r => setPendingCount(r.data.length)).catch(() => {});
    fetch();
    const interval = setInterval(fetch, 30000); // polling la 30s
    return () => clearInterval(interval);
  }, [user]);

  // Menține socketul activ cât timp userul e autentificat
  useEffect(() => {
    if (!user) return;
    getSocket(); // conectează dacă nu e deja conectat
    return () => { disconnectSocket(); };
  }, [user]);

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b border-slate-800 backdrop-blur-xl"
      style={{ backgroundColor: 'rgba(2, 6, 23, 0.92)' }}
    >
      <div className="max-w-[1700px] mx-auto px-4 md:px-8 py-2">
        <div className="min-h-10 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="text-xl font-display font-bold text-emerald-400">
            🎯 Integrame
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className={navBtn(pathname === '/dashboard')}><Home size={14} /></Link>
            <Link href="/leaderboard" className={navBtn(pathname === '/leaderboard')}><Trophy size={14} /></Link>
            <Link href="/friends" className={`relative ${navBtn(pathname === '/friends')}`}>
              <UserPlus size={14} />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                  {pendingCount}
                </span>
              )}
            </Link>
            {user && (
              <div className="flex items-center gap-2 ml-2">
                <img
                  src={user.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${user.username}`}
                  alt={user.username}
                  className="w-7 h-7 rounded-full border border-slate-600"
                />
                <div className="hidden md:flex flex-col leading-tight">
                  <Link href="/profile" className="text-[15px] font-semibold text-slate-200 hover:text-white transition-colors">
                    {user.username}
                  </Link>
                  <div className="text-[12px] text-slate-400 flex items-center gap-2 flex-wrap">
                    <span>{leagueLabel}</span>
                    <span>Rating ELO {user.rating}</span>
                    <span>Total XP {user.xp}</span>
                  </div>
                </div>
                <button onClick={handleLogout} className="inline-flex items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/20">
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {user && (
          <div className="md:hidden mt-1 flex items-center justify-end gap-2 text-[11px] text-slate-400">
            <Link href="/profile" className="font-semibold text-slate-200 hover:text-white transition-colors">
              {user.username}
            </Link>
            <span>•</span>
            <span>{leagueLabel}</span>
            <span>•</span>
            <span>ELO {user.rating}</span>
            <span>•</span>
            <span>XP {user.xp}</span>
          </div>
        )}
      </div>
    </nav>
  );
}
