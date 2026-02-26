'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trophy, User, LogOut, Home } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export default function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="text-xl font-display font-bold text-brand-400">
          🎯 Integrame
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="btn-outline py-1.5 px-3 text-sm"><Home size={14} /></Link>
          <Link href="/profile" className="btn-outline py-1.5 px-3 text-sm"><User size={14} /></Link>
          <Link href="/games/integrame/leaderboard" className="btn-outline py-1.5 px-3 text-sm"><Trophy size={14} /></Link>
          {user && (
            <div className="flex items-center gap-2 ml-2">
              <img
                src={user.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${user.username}`}
                alt={user.username}
                className="w-7 h-7 rounded-full border border-brand-500"
              />
              <span className="text-sm hidden md:block">{user.username}</span>
              <button onClick={handleLogout} className="btn-outline py-1.5 px-3 text-sm text-red-400 border-red-900 hover:bg-red-900/30">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
