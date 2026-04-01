'use client';

/**
 * /contest/[slug] — Pagina de concurs
 * ─────────────────────────────────────
 * State machine bazat pe statusul concursului + înregistrarea utilizatorului:
 *
 *  NOT_AUTH        → redirect la login
 *  NOT_REGISTERED  → detalii + buton "Înscrie-te"
 *  REGISTERED + waiting → countdown + participanți + practică
 *  REGISTERED + live    → "Joacă acum" + leaderboard live + online players
 *  ended               → leaderboard final + poziția ta
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { contestsApi, matchesApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import ContestCountdown from '@/components/contest/ContestCountdown';
import ContestLeaderboard from '@/components/contest/ContestLeaderboard';
import { ContestPublic, ContestLeaderboardEntry } from '@integrame/shared';

const GAME_LABELS: Record<string, string> = {
  integrame: '🧩 Integrame',
  labirinturi: '🌀 Labirinturi',
  maze: '🌀 Labirinturi',
  slogane: '💬 Slogane',
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  waiting: { label: 'În așteptare', cls: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700' },
  live:    { label: '🔴 LIVE',      cls: 'bg-red-900/40 text-red-300 border border-red-700 animate-pulse' },
  ended:   { label: 'Încheiat',     cls: 'bg-gray-800 text-gray-400 border border-gray-700' },
};

export default function ContestPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();

  const { user, token, _hasHydrated } = useAuthStore();
  const [contest, setContest] = useState<ContestPublic | null>(null);
  const [leaderboard, setLeaderboard] = useState<ContestLeaderboardEntry[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [playingRoundId, setPlayingRoundId] = useState<string | null>(null);

  // Fetch contest info
  const fetchContest = useCallback(async () => {
    try {
      const { data } = await contestsApi.get(slug);
      setContest(data);
      setError('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'Concursul nu a fost găsit.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Fetch initial leaderboard
  const fetchLeaderboard = useCallback(async (contestId: string) => {
    try {
      const { data } = await contestsApi.leaderboard(slug);
      setLeaderboard(data.leaderboard ?? []);
      void contestId; // used via slug
    } catch { /* ignorăm erorile de leaderboard */ }
  }, [slug]);

  useEffect(() => {
    if (!_hasHydrated) return;
    fetchContest();
  }, [_hasHydrated, fetchContest]);

  useEffect(() => {
    if (contest?.isRegistered && (contest.status === 'live' || contest.status === 'ended')) {
      fetchLeaderboard(contest.id);
    }
  }, [contest?.id, contest?.status, contest?.isRegistered, fetchLeaderboard]);

  // Socket — join contest room + listen live events
  useEffect(() => {
    if (!contest || !token) return;

    const socket = getSocket();

    socket.emit('join_contest_room', { contestId: contest.id });

    socket.on('contest_leaderboard_update', (data: { contestId: string; leaderboard: ContestLeaderboardEntry[] }) => {
      if (data.contestId === contest.id) setLeaderboard(data.leaderboard);
    });

    socket.on('contest_status_change', (data: { contestId: string; status: string }) => {
      if (data.contestId === contest.id) {
        setContest(prev => prev ? { ...prev, status: data.status as ContestPublic['status'] } : prev);
        if (data.status === 'live') fetchLeaderboard(contest.id);
      }
    });

    socket.on('contest_players_update', (data: { contestId: string; onlinePlayers: string[] }) => {
      if (data.contestId === contest.id) setOnlinePlayers(data.onlinePlayers);
    });

    return () => {
      socket.emit('leave_contest_room', { contestId: contest.id });
      socket.off('contest_leaderboard_update');
      socket.off('contest_status_change');
      socket.off('contest_players_update');
    };
  }, [contest?.id, token, fetchLeaderboard]);

  // Play round handler — creează meci la nivelul rundei și redirecționează
  const handlePlayRound = async (round: { id: string; gameType: string; minLevel: number; label: string }, mode: 'friends' | 'solo' = 'friends') => {
    if (!user) { router.push(`/login?redirect=/contest/${slug}`); return; }
    setPlayingRoundId(round.id);
    try {
      const canonicalGt = round.gameType === 'maze' ? 'labirinturi' : round.gameType;
      const { data: match } = await matchesApi.findOrCreate(canonicalGt, round.minLevel, false);
      router.push(`/games/${canonicalGt}/play?matchId=${match.id}&mode=${mode}`);
    } catch {
      setPlayingRoundId(null);
    }
  };

  // Join handler
  const handleJoin = async () => {
    if (!user) { router.push(`/login?redirect=/contest/${slug}`); return; }
    setJoining(true);
    setJoinError('');
    try {
      await contestsApi.join(slug);
      await fetchContest();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setJoinError(e.response?.data?.error ?? 'Eroare la înregistrare.');
    } finally {
      setJoining(false);
    }
  };

  // ── Waiting screen ──────────────────────────────────────────────────────────
  if (!_hasHydrated || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-6xl">🏆</p>
        <p className="text-white text-xl font-bold">{error}</p>
        <Link href="/dashboard" className="text-violet-400 hover:text-violet-300 text-sm underline">
          ← Înapoi la dashboard
        </Link>
      </div>
    );
  }

  if (!contest) return null;

  const statusBadge = STATUS_BADGE[contest.status] ?? STATUS_BADGE.waiting;
  const myRank = user ? leaderboard.find(e => e.userId === user.id) : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Dashboard
          </Link>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Contest card principal */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-black text-white">{contest.name}</h1>
              {contest.description && (
                <p className="text-gray-400 mt-2 text-sm leading-relaxed">{contest.description}</p>
              )}
              {/* Rounds display */}
              <div className="flex flex-wrap gap-2 mt-3">
                {contest.rounds.map(r => {
                  const uniqueKey = r.id;
                  return (
                    <span key={uniqueKey} className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded-full border border-gray-700 flex items-center gap-1.5">
                      <span className="text-gray-500">#{r.order}</span>
                      {r.label || (GAME_LABELS[r.gameType] ?? r.gameType)}
                      {r.minLevel > 0 && <span className={`text-xs ${r.minLevel >= 4 ? 'text-red-400' : r.minLevel >= 3 ? 'text-yellow-500' : 'text-gray-500'}`}>Niv.{r.minLevel}</span>}
                      <span className="text-gray-600">top{r.matchesCount}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Stats box */}
            <div className="flex gap-4 md:flex-col md:items-end">
              <Stat label="Înscriși" value={
                <span>
                  {contest.registeredCount}
                  {contest.maxPlayers && (
                    <span className="text-gray-500 text-xs ml-1">/ {contest.maxPlayers}</span>
                  )}
                </span>
              } />
              <Stat label="Online acum" value={
                <span className="text-green-400">{onlinePlayers.length > 0 ? onlinePlayers.length : contest.onlineCount}</span>
              } />
            </div>
          </div>

          {/* Progress bar înscrieri */}
          {contest.maxPlayers && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Locuri ocupate</span>
                <span>{Math.round((contest.registeredCount / contest.maxPlayers) * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (contest.registeredCount / contest.maxPlayers) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Timp */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
            {(() => {
              const tzShort = new Date().toLocaleTimeString('en', { timeZoneName: 'short' }).split(' ').pop() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
              return (<>
                <span>
                  🕒 Start: <span className="text-gray-300">{new Date(contest.startAt).toLocaleString('ro-RO')}</span>
                  <span className="text-gray-600 ml-1">({tzShort})</span>
                </span>
                <span>
                  🏁 Final: <span className="text-gray-300">{new Date(contest.endAt).toLocaleString('ro-RO')}</span>
                  <span className="text-gray-600 ml-1">({tzShort})</span>
                </span>
              </>);
            })()}
          </div>
        </div>

        {/* ── STATE: NOT AUTHENTICATED ──────────────────────────────────────── */}
        {!user && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 text-center space-y-4">
            <p className="text-gray-300">Trebuie să fii autentificat pentru a participa la concurs.</p>
            <Link
              href={`/login?redirect=/contest/${slug}`}
              className="inline-block bg-violet-600 hover:bg-violet-500 text-white font-bold px-6 py-3 rounded-xl transition-colors"
            >
              Autentifică-te pentru a participa
            </Link>
          </div>
        )}

        {/* ── STATE: NOT REGISTERED ────────────────────────────────────────── */}
        {user && !contest.isRegistered && contest.status !== 'ended' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 text-center space-y-4">
            <p className="text-lg font-semibold text-white">Vrei să participi la acest concurs?</p>
            <p className="text-gray-400 text-sm">
              {contest.status === 'waiting'
                ? 'Înscrie-te acum și fii gata când concursul începe.'
                : 'Concursul este live! Înscrie-te și începe să joci.'}
            </p>
            {contest.isFull ? (
              <p className="text-red-400 font-semibold">Concursul este plin.</p>
            ) : (
              <>
                {joinError && <p className="text-red-400 text-sm">{joinError}</p>}
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-colors"
                >
                  {joining ? 'Se procesează...' : '🏆 Înscrie-te la concurs'}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── STATE: REGISTERED + WAITING ─────────────────────────────────── */}
        {user && contest.isRegistered && contest.status === 'waiting' && (
          <div className="space-y-6">
            {/* Ești înscris */}
            <div className="bg-green-900/20 border border-green-800 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-green-300">Ești înscris la acest concurs!</p>
                <p className="text-sm text-green-400">Vei putea juca din momentul în care concursul devine live.</p>
              </div>
            </div>

            {/* Countdown */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 text-center">
              <ContestCountdown startAt={contest.startAt} />
            </div>

            {/* Online players */}
            {onlinePlayers.length > 0 && (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                  Online acum ({onlinePlayers.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {onlinePlayers.slice(0, 20).map(uid => (
                    <span key={uid} className="w-2 h-2 rounded-full bg-green-400 inline-block" title={uid} />
                  ))}
                  {onlinePlayers.length > 20 && (
                    <span className="text-xs text-gray-500">+{onlinePlayers.length - 20}</span>
                  )}
                </div>
              </div>
            )}

            {/* Practică */}
            <div className="bg-gray-900/50 rounded-2xl border border-gray-700 p-5 text-center">
              <p className="text-gray-400 text-sm mb-3">Vrei să te antrenezi până începe concursul?</p>
              <div className="flex flex-wrap justify-center gap-3">
                {contest.rounds.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handlePlayRound(r, 'solo')}
                    disabled={playingRoundId === r.id}
                    className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-gray-700"
                  >
                    {playingRoundId === r.id ? 'Se pornește...' : `${GAME_LABELS[r.gameType] ?? r.gameType} Niv.${r.minLevel} — Practică`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STATE: REGISTERED + LIVE ─────────────────────────────────────── */}
        {user && contest.isRegistered && contest.status === 'live' && (
          <div className="space-y-6">
            {/* Banner live */}
            <div className="bg-red-900/20 border border-red-700 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-red-400 animate-pulse" />
                <div>
                  <p className="font-bold text-red-300 text-lg">Concursul este LIVE!</p>
                  <p className="text-sm text-red-400">Scorurile tale contează acum. Joacă și urcă în clasament!</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {contest.rounds.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handlePlayRound(r, 'friends')}
                    disabled={playingRoundId === r.id}
                    className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl transition-colors text-sm flex flex-col items-start"
                  >
                    <span>{playingRoundId === r.id ? 'Se pornește...' : `▶ ${r.label || (GAME_LABELS[r.gameType] ?? r.gameType)}`}</span>
                    <span className="text-red-200 text-xs font-normal">Nivel {r.minLevel} · {GAME_LABELS[r.gameType] ?? r.gameType}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rank-ul meu */}
            {myRank && (
              <div className="bg-violet-900/20 border border-violet-700 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-violet-400 uppercase tracking-wider">Poziția ta</p>
                  <p className="text-3xl font-black text-violet-300">#{myRank.rank}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-violet-400 uppercase tracking-wider">Scorul tău total</p>
                  <p className="text-3xl font-black text-white font-mono">{myRank.totalScore.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-violet-400 uppercase tracking-wider">Meciuri jucate</p>
                  <p className="text-2xl font-bold text-gray-300">{myRank.matchesPlayed}</p>
                </div>
              </div>
            )}

            {/* Online players */}
            {onlinePlayers.length > 0 && (
              <div className="bg-gray-900/60 rounded-xl border border-gray-800 px-4 py-2 flex items-center gap-2 text-sm text-gray-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span>{onlinePlayers.length} jucător{onlinePlayers.length !== 1 ? 'i' : ''} online acum</span>
              </div>
            )}

            {/* Leaderboard live */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white">🏆 Clasament live</h2>
                <span className="text-xs text-red-400 animate-pulse font-semibold">● LIVE</span>
              </div>
              <ContestLeaderboard
                entries={leaderboard}
                currentUserId={user?.id}
                rounds={contest.rounds}
              />
            </div>
          </div>
        )}

        {/* ── STATE: ENDED ─────────────────────────────────────────────────── */}
        {contest.status === 'ended' && (
          <div className="space-y-6">
            {/* Banner final */}
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 text-center">
              <p className="text-4xl mb-2">🏁</p>
              <p className="font-bold text-white text-xl">Concursul s-a încheiat!</p>
              <p className="text-gray-400 text-sm mt-1">Iată clasamentul final.</p>
            </div>

            {/* Rank final al meu */}
            {myRank && user && (
              <div className="bg-violet-900/20 border border-violet-700 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-violet-400 uppercase tracking-wider">Poziția finală</p>
                  <p className="text-4xl font-black text-violet-300">
                    {myRank.rank === 1 ? '🥇' : myRank.rank === 2 ? '🥈' : myRank.rank === 3 ? '🥉' : `#${myRank.rank}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-violet-400 uppercase tracking-wider">Scor final</p>
                  <p className="text-3xl font-black text-white font-mono">{myRank.totalScore.toLocaleString()}</p>
                </div>
                <div className="text-right text-right">
                  <p className="text-xs text-violet-400 uppercase tracking-wider">Meciuri jucate</p>
                  <p className="text-2xl font-bold text-gray-300">{myRank.matchesPlayed}</p>
                </div>
              </div>
            )}

            {/* Leaderboard final */}
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
              <h2 className="font-bold text-white mb-4">🏆 Clasament final</h2>
              <ContestLeaderboard
                entries={leaderboard}
                currentUserId={user?.id}
                rounds={contest.rounds}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center md:text-right">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}
