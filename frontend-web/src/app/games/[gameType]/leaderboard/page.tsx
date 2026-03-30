'use client';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { leaderboardApi, api } from '@/lib/api';
import { LeaderboardEntry } from '@integrame/shared';
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

function LeaderboardPageInner({ params }: PageProps) {
  const { gameType } = params;
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [levelConfigs, setLevelConfigs] = useState<PublicLevelConfig[]>([]);
  const [level, setLevel] = useState<number>(parseInt(searchParams.get('level') || '1'));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<PublicLevelConfig[]>(`/games/levels/${gameType}`)
      .then((r) => setLevelConfigs([...r.data].sort((a, b) => a.level - b.level)))
      .catch(() => {});
  }, [gameType]);

  useEffect(() => {
    setLoading(true);
    leaderboardApi.get({ gameType, level, page })
      .then((r) => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameType, level, page]);

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <div className="game-page min-h-screen bg-white">
      <nav className="border-b border-gray-100 h-14 flex items-center justify-between px-6 bg-white">
        <Link href="/dashboard" className="text-violet-600 font-bold text-lg">🎯 Integrame</Link>
        <h1 className="font-bold text-gray-800 flex items-center gap-2">
          <Trophy size={18} className="text-violet-600" />
          Clasament – {gameType.charAt(0).toUpperCase() + gameType.slice(1)}
        </h1>
        <div className="w-24" />
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Level filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {levelConfigs.map((cfg) => (
            <button
              key={cfg.level}
              onClick={() => { setLevel(cfg.level); setPage(1); }}
              className={clsx(
                'px-4 py-1.5 rounded-full text-sm font-medium transition',
                cfg.level === level
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              {cfg.displayName}
              <span className="text-[10px] ml-1 opacity-60">max {cfg.maxPlayers}</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-gray-400 border-b border-gray-100 bg-gray-50">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Jucător</div>
            <div className="col-span-2 text-center">Rating</div>
            <div className="col-span-2 text-center">Victorii</div>
            <div className="col-span-2 text-center">Win%</div>
          </div>

          {loading && (
            <div className="py-12 flex justify-center">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="py-12 text-center text-gray-400 text-sm">
              Niciun jucător încă pe acest nivel. Fii primul! 🏆
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {entries.map((e, idx) => {
              const globalIdx = (page - 1) * 20 + idx;
              return (
                <div key={e.userId} className="grid grid-cols-12 px-4 py-3 items-center hover:bg-gray-50 transition">
                  <div className="col-span-1 text-sm font-medium">
                    {globalIdx < 3 ? <span className="text-lg">{MEDALS[globalIdx]}</span> : <span className="text-gray-400">#{e.rank}</span>}
                  </div>
                  <div className="col-span-5 flex items-center gap-2">
                    <img
                      src={e.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${e.username}`}
                      alt={e.username}
                      className="w-8 h-8 rounded-full border border-gray-200"
                    />
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{e.username}</div>
                      <span className={clsx('text-[10px] font-medium', {
                        'text-amber-600': e.league === 'bronze',
                        'text-slate-500': e.league === 'silver',
                        'text-yellow-600': e.league === 'gold',
                        'text-cyan-600': e.league === 'platinum',
                        'text-blue-600': e.league === 'diamond',
                      })}>
                        {e.league}
                      </span>
                    </div>
                  </div>
                  <div className="col-span-2 text-center font-bold text-violet-700">{e.rating}</div>
                  <div className="col-span-2 text-center text-gray-600">{e.wins}</div>
                  <div className="col-span-2 text-center text-gray-600">{e.winRate}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 disabled:opacity-40 transition"
          >
            ← Înapoi
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">Pagina {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={entries.length < 20}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 disabled:opacity-40 transition"
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LeaderboardPageInner params={params} />
    </Suspense>
  );
}
