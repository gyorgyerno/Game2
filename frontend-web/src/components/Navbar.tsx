'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trophy, LogOut, Home, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState } from 'react';
import { friendsApi } from '@/lib/api';

export default function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const leagueLabel = user?.league ? user.league.charAt(0).toUpperCase() + user.league.slice(1) : '';
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetch = () => friendsApi.requests().then(r => setPendingCount(r.data.length)).catch(() => {});
    fetch();
    const interval = setInterval(fetch, 30000); // polling la 30s
    return () => clearInterval(interval);
  }, [user]);

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b border-violet-300/20 backdrop-blur-xl"
      style={{ backgroundColor: 'rgba(33, 3, 64, 0.88)' }}
    >
      <div className="max-w-[1700px] mx-auto px-4 md:px-8 py-2">
        <div className="min-h-10 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="text-xl font-display font-bold text-violet-200">
            🎯 Integrame
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-violet-100 transition-colors hover:bg-white/20"><Home size={14} /></Link>
            <Link href="/games/integrame/leaderboard" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-violet-100 transition-colors hover:bg-white/20"><Trophy size={14} /></Link>
            <Link href="/profile#prieteni" className="relative inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-violet-100 transition-colors hover:bg-white/20">
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
                  className="w-7 h-7 rounded-full border border-violet-300/60"
                />
                <div className="hidden md:flex flex-col leading-tight">
                  <Link href="/profile" className="text-[15px] font-semibold text-violet-100 hover:text-white transition-colors">
                    {user.username}
                  </Link>
                  <div className="text-[12px] text-violet-200/80 flex items-center gap-2 flex-wrap">
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
          <div className="md:hidden mt-1 flex items-center justify-end gap-2 text-[11px] text-violet-200/85">
            <Link href="/profile" className="font-semibold text-violet-100 hover:text-white transition-colors">
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
