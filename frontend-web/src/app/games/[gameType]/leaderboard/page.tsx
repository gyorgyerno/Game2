'use client';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { leaderboardApi, api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { LeaderboardEntry } from '@integrame/shared';
import Navbar from '@/components/Navbar';
import clsx from 'clsx';

interface PageProps {
  params: { gameType: string };
}

type PublicLevelConfig = {
  level: number;
  displayName: string;
  maxPlayers: number;
  winsToUnlock: number;
  gamesPerLevel: number;
};

const MEDALS = ['🥇', '🥈', '🥉'];

const LEAGUE_COLORS: Record<string, string> = {
  bronze:   'text-amber-600',
  silver:   'text-slate-400',
  gold:     'text-yellow-400',
  platinum: 'text-cyan-400',
  diamond:  'text-blue-400',
};

const GAME_LABELS: Record<string, string> = {
  integrame: 'Integrame',
  labirinturi: 'Labirinturi',
};

function EntryRow({ e, highlight, globalIdx }: { e: LeaderboardEntry; highlight?: boolean; globalIdx: number }) {
  return (
    <div
      className={clsx(
        'grid grid-cols-12 px-4 py-3 items-center transition',
        highlight
          ? 'bg-emerald-500/10 border border-emerald-500/30 rounded-2xl'
          : 'hover:bg-slate-800/40',
      )}
    >
      <div className="col-span-1 text-sm font-bold">
        {globalIdx < 3
          ? <span className="text-xl">{MEDALS[globalIdx]}</span>
          : <span className="text-slate-400">#{e.rank}</span>}
      </div>
      <div className="col-span-5 flex items-center gap-3">
        <img
          src={e.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${e.username}`}
          alt={e.username}
          className={clsx('w-9 h-9 rounded-xl object-cover border', highlight ? 'border-emerald-500' : 'border-slate-700')}
        />
        <div>
          <div className={clsx('text-sm font-semibold', highlight ? 'text-emerald-300' : 'text-slate-200')}>
            {e.username} {highlight && <span className="text-xs text-emerald-400 ml-1">← tu</span>}
          </div>
          <span className={clsx('text-[11px] font-medium capitalize', LEAGUE_COLORS[e.league] ?? 'text-slate-400')}>
            {e.league}
          </span>
        </div>
      </div>
      <div className="col-span-2 text-center">
        <span className="font-bold text-sky-400">{e.rating}</span>
        <div className="text-[10px] text-slate-500">ELO</div>
      </div>
      <div className="col-span-2 text-center">
        <span className="font-bold text-violet-400">{e.wins}</span>
        <div className="text-[10px] text-slate-500">victorii</div>
      </div>
      <div className="col-span-2 text-center">
        <span className="font-bold text-emerald-400">{e.winRate}%</span>
        <div className="text-[10px] text-slate-500">win rate</div>
      </div>
    </div>
  );
}

function LeaderboardPageInner({ params }: PageProps) {
  const { gameType } = params;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { token, _hasHydrated, fetchMe, user } = useAuthStore();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [levelConfigs, setLevelConfigs] = useState<PublicLevelConfig[]>([]);
  const [level, setLevel] = useState<number>(parseInt(searchParams.get('level') || '1'));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    fetchMe();
    api.get<PublicLevelConfig[]>(`/games/levels/${gameType}`)
      .then((r) => setLevelConfigs([...r.data].sort((a, b) => a.level - b.level)))
      .catch(() => {});
  }, [_hasHydrated, token, gameType]);

  useEffect(() => {
    setLoading(true);
    leaderboardApi.get({ gameType, level, page })
      .then((r) => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameType, level, page]);

  const gameLabel = GAME_LABELS[gameType] ?? gameType.charAt(0).toUpperCase() + gameType.slice(1);

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#020617' }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(52,211,153,0.12) 0%, transparent 70%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 40% at 80% 80%, rgba(139,92,246,0.10) 0%, transparent 70%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 40% 35% at 60% 10%, rgba(56,189,248,0.07) 0%, transparent 70%)' }} />
      <Navbar />

      <main className="relative max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Trophy size={24} className="text-yellow-400" />
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Clasament – {gameLabel}</h1>
              <p className="text-slate-400 text-sm">Top jucători per nivel</p>
            </div>
          </div>
          <Link href="/leaderboard" className="text-xs text-slate-500 hover:text-slate-300 transition">
            ← Global
          </Link>
        </div>

        {/* Level filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {levelConfigs.map((cfg) => (
            <button
              key={cfg.level}
              onClick={() => { setLevel(cfg.level); setPage(1); }}
              className={clsx(
                'px-4 py-1.5 rounded-full text-sm font-medium transition border',
                cfg.level === level
                  ? 'bg-violet-600/80 border-violet-500/50 text-white'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/60'
              )}
            >
              {cfg.displayName}
              <span className="text-[10px] ml-1 opacity-50">max {cfg.maxPlayers}</span>
            </button>
          ))}
        </div>

        {/* Coloane header */}
        <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-slate-500 mb-1">
          <div className="col-span-1">#</div>
          <div className="col-span-5">Jucător</div>
          <div className="col-span-2 text-center">Rating ELO</div>
          <div className="col-span-2 text-center">Victorii</div>
          <div className="col-span-2 text-center">Win rate</div>
        </div>

        {/* Tabel */}
        <div className="rounded-[28px] border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden">
          {loading && (
            <div className="py-16 flex justify-center">
              <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && entries.length === 0 && (
            <div className="py-16 text-center text-slate-400 text-sm">
              Niciun jucător încă pe acest nivel. Fii primul! 🏆
            </div>
          )}
          {!loading && entries.length > 0 && (
            <div className="divide-y divide-slate-800/60 p-2 space-y-0.5">
              {entries.map((e, idx) => {
                const globalIdx = (page - 1) * 20 + idx;
                const isMe = user ? String(e.userId) === String(user.id) : false;
                return <EntryRow key={e.userId} e={e} highlight={isMe} globalIdx={globalIdx} />;
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700/60 disabled:opacity-30 transition"
          >
            ← Înapoi
          </button>
          <span className="px-4 py-2 text-sm text-slate-500">Pagina {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={entries.length < 20}
            className="px-4 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700/60 disabled:opacity-30 transition"
          >
            Înainte →
          </button>
        </div>
      </main>
    </div>
  );
}

export default function LeaderboardPage({ params }: PageProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#020617' }}>
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LeaderboardPageInner params={params} />
    </Suspense>
  );
}
