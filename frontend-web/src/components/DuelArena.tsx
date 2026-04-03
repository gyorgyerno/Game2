'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle2, XCircle, Trophy, Zap } from 'lucide-react';
import { getSocket, SOCKET_EVENTS } from '@/lib/socket';
import { Match, MatchPlayer, GAME_RULES } from '@integrame/shared';
import { useMatchResultStore } from '@/store/matchResult';
import clsx from 'clsx';

interface Props {
  matchId: string;
  gameType: string;
  userId: string;
}

export default function DuelArena({ matchId, gameType, userId }: Props) {
  const router = useRouter();
  const setLastMatch = useMatchResultStore((s) => s.setLastMatch);
  const [match, setMatch] = useState<Match | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [effectiveTimeLimit, setEffectiveTimeLimit] = useState(0);
  const [myCorrect, setMyCorrect] = useState(0);
  const [myMistakes, setMyMistakes] = useState(0);
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socket = getSocket();

  const rules = GAME_RULES[gameType] || GAME_RULES['integrame'];

  useEffect(() => {
    socket.emit(SOCKET_EVENTS.JOIN_MATCH, { matchId });

    socket.on(SOCKET_EVENTS.MATCH_STATE, (m: Match) => setMatch(m));
    socket.on(SOCKET_EVENTS.MATCH_COUNTDOWN, ({ countdown: c }: { countdown: number }) => setCountdown(c));
    socket.on(SOCKET_EVENTS.MATCH_START, (data?: { timeLimit?: number }) => {
      const tl = data?.timeLimit ?? rules.timeLimit;
      setCountdown(null);
      setStarted(true);
      setEffectiveTimeLimit(tl);
      setTimeLeft(tl);
    });
    socket.on(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, (data: { userId: string; liveScore: number; correctAnswers: number; mistakes: number; finished?: boolean }) => {
      setMatch((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.userId === data.userId
              ? { ...p, score: data.liveScore, correctAnswers: data.correctAnswers, mistakes: data.mistakes, ...(data.finished ? { finishedAt: new Date().toISOString() } : {}) }
              : p
          ),
        };
      });
    });
    socket.on(SOCKET_EVENTS.MATCH_FINISHED, (finalMatch: Match) => {
      setFinished(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setLastMatch(finalMatch);
      setTimeout(() => router.push(`/games/${gameType}/result?matchId=${matchId}`), 1500);
    });

    return () => {
      socket.off(SOCKET_EVENTS.MATCH_STATE);
      socket.off(SOCKET_EVENTS.MATCH_COUNTDOWN);
      socket.off(SOCKET_EVENTS.MATCH_START);
      socket.off(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE);
      socket.off(SOCKET_EVENTS.MATCH_FINISHED);
      socket.emit(SOCKET_EVENTS.LEAVE_MATCH, { matchId });
    };
  }, [matchId, gameType]);

  // Countdown timer
  useEffect(() => {
    if (!started || finished || effectiveTimeLimit === 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [started, finished, effectiveTimeLimit]);

  // Emit progress — throttled 150ms to avoid socket spam on fast answers
  useEffect(() => {
    if (!started || finished) return;
    if (progressThrottleRef.current) clearTimeout(progressThrottleRef.current);
    progressThrottleRef.current = setTimeout(() => {
      socket.emit(SOCKET_EVENTS.PLAYER_PROGRESS, { matchId, correctAnswers: myCorrect, mistakes: myMistakes });
    }, 150);
    return () => {
      if (progressThrottleRef.current) clearTimeout(progressThrottleRef.current);
    };
  }, [myCorrect, myMistakes, started]);

  function handleCorrect() { setMyCorrect((c) => c + 1); }
  function handleMistake() { setMyMistakes((m) => m + 1); }

  function handleFinish() {
    if (finished) return;
    setFinished(true);
    if (timerRef.current) clearInterval(timerRef.current);
    socket.emit(SOCKET_EVENTS.PLAYER_FINISH, { matchId, correctAnswers: myCorrect, mistakes: myMistakes });
  }

  const myPlayer = match?.players.find((p: any) => p.userId === userId);
  const sortedPlayers = match?.players
    ? [...match.players].sort((a: any, b: any) => b.score - a.score)
    : [];

  const timerPct = effectiveTimeLimit > 0 ? (timeLeft / effectiveTimeLimit) * 100 : 0;
  const timerColor = timeLeft > 30 ? 'bg-brand-500' : timeLeft > 10 ? 'bg-yellow-500' : 'bg-red-500';

  if (!match) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400">Se conectează la meci...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Countdown overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center">
          <div className="text-center animate-bounce-in">
            <div className="text-9xl font-display font-bold text-brand-400">{countdown || '🚀'}</div>
            <p className="text-slate-400 mt-4">Meciul începe!</p>
          </div>
        </div>
      )}

      {/* Timer bar */}
      {started && effectiveTimeLimit > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <Clock size={14} /> Timp rămas
            </div>
            <span className={clsx('font-mono font-bold text-lg', timeLeft <= 10 && 'text-red-400 animate-pulse')}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-1000', timerColor)}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </div>
      )}
      {started && effectiveTimeLimit === 0 && (
        <div className="flex items-center gap-1.5 text-sm text-slate-400">
          <Clock size={14} /> <span>∞ Fără limită de timp</span>
        </div>
      )}

      {/* Waiting */}
      {match.status === 'waiting' && (
        <div className="card text-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-300 font-medium">Se așteaptă jucători...</p>
          <p className="text-slate-500 text-sm mt-1">{match.players.length} / {match.players.length} conectați</p>
        </div>
      )}

      {/* Players grid – adapts to 1–20 players */}
      <div className={clsx(
        'grid gap-3',
        sortedPlayers.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
        sortedPlayers.length <= 4 ? 'grid-cols-2' :
        sortedPlayers.length <= 8 ? 'grid-cols-2 md:grid-cols-4' :
        sortedPlayers.length <= 12 ? 'grid-cols-3 md:grid-cols-4' :
        'grid-cols-4 md:grid-cols-5'
      )}>
        {sortedPlayers.map((p: any, idx: number) => {
          const isMe = p.userId === userId;
          return (
            <div
              key={p.userId}
              className={clsx(
                'card flex flex-col items-center gap-2 py-4 transition-all',
                isMe && 'border-brand-500 ring-1 ring-brand-500',
                idx === 0 && started && 'border-yellow-500/50 bg-yellow-500/5'
              )}
            >
              {idx === 0 && started && <Trophy size={14} className="text-yellow-400 absolute top-2 right-2" />}
              <img
                src={p.user?.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${p.user?.username || p.userId}`}
                alt={p.user?.username}
                className="w-10 h-10 rounded-full border-2 border-slate-700"
              />
              <span className="text-sm font-medium truncate max-w-full px-2">
                {p.user?.username || 'Jucător'}
                {isMe && <span className="text-brand-400 text-xs ml-1">(tu)</span>}
              </span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-400 flex items-center gap-0.5"><CheckCircle2 size={11} />{p.correctAnswers}</span>
                <span className="text-red-400 flex items-center gap-0.5"><XCircle size={11} />{p.mistakes}</span>
              </div>
              <div className="text-lg font-bold text-brand-400">{p.score} <span className="text-xs text-slate-400">pts</span></div>
              {p.finishedAt && (
                <span className="badge bg-green-900 text-green-300 text-xs">✓ Terminat</span>
              )}
            </div>
          );
        })}
      </div>

      {/* My controls */}
      {started && !finished && (
        <div className="card">
          <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
            <Zap size={14} /> Răspunsurile mele
          </h3>
          <div className="flex gap-4 flex-wrap">
            <button onClick={handleCorrect} className="btn-primary flex-1">
              <CheckCircle2 size={16} /> Corect (+{rules.pointsPerCorrect})
            </button>
            <button onClick={handleMistake} className="btn-danger flex-1">
              <XCircle size={16} /> Greșit ({rules.pointsPerMistake})
            </button>
          </div>
          <div className="flex justify-between mt-3 text-sm text-slate-400">
            <span>Score live: <strong className="text-white">{myPlayer?.score ?? 0}</strong></span>
            <span>✓ {myCorrect} / ✗ {myMistakes}</span>
          </div>
          <button
            onClick={handleFinish}
            className="btn-secondary w-full mt-4"
          >
            🏁 Am terminat!
          </button>
        </div>
      )}

      {finished && (
        <div className="card text-center py-6 border-green-500/30">
          <p className="text-green-400 font-bold text-lg">✅ Ai terminat! Se calculează rezultatele...</p>
        </div>
      )}
    </div>
  );
}
