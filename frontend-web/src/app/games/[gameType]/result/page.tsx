'use client';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Star, Zap, RotateCcw, UserPlus, Crown } from 'lucide-react';
import { matchesApi, invitesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Navbar from '@/components/Navbar';
import clsx from 'clsx';

interface PageProps {
  params: { gameType: string };
}

const POSITION_COLORS = ['text-yellow-500', 'text-slate-300', 'text-amber-600', 'text-gray-400'];
const POSITION_BG = ['bg-yellow-50 border-yellow-200', 'bg-slate-50 border-slate-200', 'bg-amber-50 border-amber-200'];
const MEDALS = ['🥇', '🥈', '🥉'];

function GameResultPageInner({ params }: PageProps) {
  const { gameType } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  const { user, token, _hasHydrated } = useAuthStore();
  const [match, setMatch] = useState<any>(null);
  const [inviteUrl, setInviteUrl] = useState('');

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    if (matchId) matchesApi.getMatch(matchId).then((r) => setMatch(r.data)).catch(() => {});
  }, [_hasHydrated, matchId, token]);

  if (!_hasHydrated) return <div className="min-h-screen bg-white" />;

  async function handleInvite() {
    try {
      const level = match?.level || 1;
      const { data } = await invitesApi.create({ matchId, gameType, level });
      setInviteUrl(`${window.location.origin}/invite/${data.code}`);
    } catch { /* noop */ }
  }

  if (!match) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Sortare după position (setat corect în backend, inclusiv la forfeit)
  // Fallback la score dacă position nu e setat (ex. meci vechi)
  const sorted = [...(match.players || [])].sort((a: any, b: any) => {
    if (a.position != null && b.position != null) return a.position - b.position;
    return b.score - a.score;
  });
  const myResult = sorted.find((p: any) => p.userId === user?.id);
  const myPos = myResult?.position ?? (sorted.indexOf(myResult) + 1);

  return (
    <div className="game-page min-h-screen bg-white">
      {/* Simple light navbar */}
      <nav className="border-b border-gray-100 h-14 flex items-center justify-between px-6 bg-white">
        <Link href="/dashboard" className="text-violet-600 font-bold text-lg">🎯 Integrame</Link>
        {user && (
          <img
            src={user.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${user.username}`}
            alt={user.username}
            className="w-8 h-8 rounded-full border border-gray-200"
          />
        )}
      </nav>

      <main className="max-w-xl mx-auto px-4 py-10">
        {/* My result hero */}
        {myResult && (
          <div className={clsx(
            'rounded-2xl border-2 p-6 text-center mb-8',
            POSITION_BG[Math.min(myPos - 1, 2)] || 'bg-gray-50 border-gray-200'
          )}>
            <div className="text-5xl mb-2">{MEDALS[myPos - 1] || `#${myPos}`}</div>
            <div className={clsx('text-3xl font-black', POSITION_COLORS[Math.min(myPos - 1, 3)])}>
              Locul {myPos}
            </div>
            <div className="flex justify-center gap-8 mt-4">
              <div>
                <div className="text-2xl font-bold text-gray-800">{myResult.score}</div>
                <div className="text-xs text-gray-400">puncte</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-500">+{myResult.xpGained}</div>
                <div className="text-xs text-gray-400">XP</div>
              </div>
              <div>
                <div className={clsx('text-2xl font-bold', myResult.eloChange >= 0 ? 'text-green-600' : 'text-red-500')}>
                  {myResult.eloChange >= 0 ? '+' : ''}{myResult.eloChange}
                </div>
                <div className="text-xs text-gray-400">ELO</div>
              </div>
            </div>
          </div>
        )}

        {/* All players ranking */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Trophy size={16} className="text-violet-600" />
            <h2 className="font-bold text-gray-800">Clasament final</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {sorted.map((p: any, idx: number) => {
              const isMe = p.userId === user?.id;
              return (
                <div
                  key={p.userId}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3',
                    isMe && 'bg-violet-50'
                  )}
                >
                  <span className="text-lg w-6 text-center">{MEDALS[idx] || `#${idx + 1}`}</span>
                  <img
                    src={p.user?.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${p.user?.username}`}
                    alt={p.user?.username}
                    className="w-9 h-9 rounded-full border border-gray-200"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800 text-sm">
                      {p.user?.username || 'Player'}
                      {isMe && <span className="text-violet-500 text-xs ml-1">(tu)</span>}
                    </div>
                    <div className="text-xs text-gray-400">{p.correctAnswers} corecte · {p.mistakes} greșeli</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-800">{p.score} <span className="text-xs text-gray-400">pts</span></div>
                    <div className="text-xs text-yellow-500">+{p.xpGained} XP</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex gap-3">
          <Link
            href={`/games/${gameType}/play`}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl py-3 text-sm transition"
          >
            <RotateCcw size={16} /> Joacă din nou
          </Link>
          <button
            onClick={handleInvite}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-xl py-3 text-sm transition"
          >
            <UserPlus size={16} /> Invită prieteni
          </button>
        </div>

        {inviteUrl && (
          <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center gap-2">
            <input readOnly value={inviteUrl} className="flex-1 bg-transparent text-xs text-violet-700 truncate outline-none" />
            <button
              onClick={() => { navigator.clipboard.writeText(inviteUrl); }}
              className="text-xs bg-violet-600 text-white px-3 py-1 rounded-lg hover:bg-violet-700 transition"
            >
              Copiază
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function GameResultPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <GameResultPageInner params={params} />
    </Suspense>
  );
}
