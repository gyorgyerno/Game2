'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { leaderboardApi, GlobalLeaderboardEntry } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Navbar from '@/components/Navbar';
import clsx from 'clsx';

const MEDALS = ['🥇', '🥈', '🥉'];

const LEAGUE_COLORS: Record<string, string> = {
  bronze:   'text-amber-600',
  silver:   'text-slate-400',
  gold:     'text-yellow-400',
  platinum: 'text-cyan-400',
  diamond:  'text-blue-400',
};

function EntryRow({ e, highlight }: { e: GlobalLeaderboardEntry; highlight?: boolean }) {
  return (
    <div
      className={clsx(
        'grid grid-cols-12 px-4 py-3 items-center transition',
        highlight
          ? 'bg-emerald-500/10 border border-emerald-500/30 rounded-2xl'
          : 'hover:bg-slate-800/40',
      )}
    >
      {/* Rank */}
      <div className="col-span-1 text-sm font-bold">
        {e.rank <= 3
          ? <span className="text-xl">{MEDALS[e.rank - 1]}</span>
          : <span className="text-slate-400">#{e.rank}</span>}
      </div>

      {/* Jucător */}
      <div className="col-span-5 flex items-center gap-3">
        <img
          src={e.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${e.username}`}
          alt={e.username}
          className={clsx('w-9 h-9 rounded-xl object-cover border', highlight ? 'border-emerald-500' : 'border-slate-700')}
        />
        <div>
          <div className={clsx('text-sm font-semibold', highlight ? 'text-emerald-300' : 'text-slate-200')}>
            {e.username} {e.isMe && <span className="text-xs text-emerald-400 ml-1">← tu</span>}
          </div>
          <span className={clsx('text-[11px] font-medium capitalize', LEAGUE_COLORS[e.league] ?? 'text-slate-400')}>
            {e.league}
          </span>
        </div>
      </div>

      {/* Rating ELO */}
      <div className="col-span-2 text-center">
        <span className="font-bold text-sky-400">{e.rating}</span>
        <div className="text-[10px] text-slate-500">ELO</div>
      </div>

      {/* XP */}
      <div className="col-span-2 text-center">
        <span className="font-bold text-yellow-400">{e.xp.toLocaleString('ro')}</span>
        <div className="text-[10px] text-slate-500">XP</div>
      </div>

      {/* Victorii */}
      <div className="col-span-2 text-center">
        <span className="font-bold text-violet-400">{e.wins}</span>
        <div className="text-[10px] text-slate-500">victorii</div>
      </div>
    </div>
  );
}

export default function GlobalLeaderboardPage() {
  const router = useRouter();
  const { token, _hasHydrated, fetchMe } = useAuthStore();
  const [top, setTop] = useState<GlobalLeaderboardEntry[]>([]);
  const [me, setMe] = useState<GlobalLeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    fetchMe();
    leaderboardApi.getGlobal()
      .then((r) => { setTop(r.data.top); setMe(r.data.me); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [_hasHydrated, token]);

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#020617' }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(52,211,153,0.12) 0%, transparent 70%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 40% at 80% 80%, rgba(139,92,246,0.10) 0%, transparent 70%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 40% 35% at 60% 10%, rgba(56,189,248,0.07) 0%, transparent 70%)' }} />
      <Navbar />
      <main className="relative max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Trophy size={24} className="text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Clasament Global</h1>
            <p className="text-slate-400 text-sm">Top 15 jucători din toate jocurile</p>
          </div>
        </div>

        {/* Coloane header */}
        <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-slate-500 mb-1">
          <div className="col-span-1">#</div>
          <div className="col-span-5">Jucător</div>
          <div className="col-span-2 text-center">Rating ELO</div>
          <div className="col-span-2 text-center">XP</div>
          <div className="col-span-2 text-center">Victorii</div>
        </div>

        {/* Tabel */}
        <div className="rounded-[28px] border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden">
          {loading && (
            <div className="py-16 flex justify-center">
              <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && top.length === 0 && (
            <div className="py-16 text-center text-slate-400 text-sm">
              Niciun jucător deocamdată. Fii primul! 🏆
            </div>
          )}

          {!loading && top.length > 0 && (
            <div className="divide-y divide-slate-800/60 p-2 space-y-0.5">
              {top.map((e) => (
                <EntryRow key={e.userId} e={e} highlight={e.isMe} />
              ))}
            </div>
          )}
        </div>

        {/* Locul userului dacă nu e în top 15 */}
        {!loading && me && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 text-center mb-2">— Locul tău în clasament —</div>
            <div className="rounded-[24px] border border-slate-700 bg-slate-900/80 p-2">
              <EntryRow e={me} highlight />
            </div>
          </div>
        )}

        {/* Link spre clasamente per joc */}
        <div className="mt-8 text-center">
          <p className="text-slate-500 text-sm mb-3">Vezi clasament per joc</p>
          <div className="flex gap-3 justify-center flex-wrap">
            {['integrame', 'labirinturi'].map((g) => (
              <Link
                key={g}
                href={`/games/${g}/leaderboard`}
                className="px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700/60 transition capitalize"
              >
                {g}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
