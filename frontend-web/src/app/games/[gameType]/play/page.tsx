'use client';
import { Suspense } from 'react';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import '../../../globals-game.css';
import GameRenderer from '@/games/GameRenderer';
import PlayerSidebar from '@/components/game/PlayerSidebar';
import AIChatWidget from '@/components/game/AIChatWidget';
import GameNavbar from '@/components/game/GameNavbar';
import GameTimer from '@/components/game/GameTimer';
import EmojiReactions from '@/components/game/EmojiReactions';
import GameLobbyPanel from '@/components/game/GameLobbyPanel';
import { useAuthStore } from '@/store/auth';
import { matchesApi, aiApi, gamesApi } from '@/lib/api';
import { getSocket, SOCKET_EVENTS } from '@/lib/socket';
import { GAME_RULES, Match, MatchPlayer, MAX_PLAYERS_PER_LEVEL, GameLevel } from '@integrame/shared';
import { SAMPLE_INTEGRAMA } from '@/lib/puzzles';
import type { CrosswordPuzzle } from '@/components/game/CrosswordGrid';
import clsx from 'clsx';
import { isLabyrinthGameType, toCanonicalGameType, getGameByType } from '@/games/registry';

interface PageProps {
  params: { gameType: string };
}

function GamePlayPageInner({ params }: PageProps) {
  const { gameType } = params;
  const canonicalGameType = toCanonicalGameType(gameType);
  const isLabyrinth = isLabyrinthGameType(gameType);
  const accent = isLabyrinth
    ? { countdownMain: 'text-emerald-600', countdownWarn: 'text-orange-500' }
    : { countdownMain: 'text-violet-600',  countdownWarn: 'text-red-500' };
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  const mode = searchParams.get('mode') || '';
  const allowInvite = mode === 'friends';
  const isAI = searchParams.get('ai') === '1';
  const aiLevel = parseInt(searchParams.get('level') || '1', 10);
  const aiTheme = searchParams.get('theme') || 'general';
  const { user, token, fetchMe, _hasHydrated } = useAuthStore();

  const [match, setMatch] = useState<Match | null>(null);
  const [started, setStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [correctWords, setCorrectWords] = useState(0);
  const [wrongWords, setWrongWords] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [levelUp, setLevelUp] = useState({ show: false, level: 1 });
  const [linkCopied, setLinkCopied] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [aiPuzzle, setAiPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [lastReaction, setLastReaction] = useState<{ userId: string; emoji: string; fromMe: boolean } | null>(null);
  const [latestMetrics, setLatestMetrics] = useState<Record<string, unknown> | undefined>(undefined);
  const [mazeSeed, setMazeSeed] = useState<number | undefined>(undefined);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);
  const mountTimeRef = useRef<number>(0);
  const staticRules = GAME_RULES[canonicalGameType] || GAME_RULES['integrame'];
  const [serverTimeLimit, setServerTimeLimit] = useState<number>(staticRules.timeLimit);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch timeLimit din admin (suprascrie valoarea hardcoded din shared)
  useEffect(() => {
    gamesApi.getRules(canonicalGameType)
      .then((r) => setServerTimeLimit(r.data.timeLimit))
      .catch(() => {});
  }, [canonicalGameType]);

  useEffect(() => {
    gamesApi.getUiConfig()
      .then((r) => setAiAssistantEnabled(r.data.aiAssistantEnabled))
      .catch(() => {});
  }, []);

  const puzzle: CrosswordPuzzle = aiPuzzle || SAMPLE_INTEGRAMA;
  const rules = { ...staticRules, timeLimit: serverTimeLimit };
  // Calculeaza timpurile ramas corect dupa refresh, pe baza match.startedAt de pe server
  const initialGameSeconds = useMemo(() => {
    if (!started || !match?.startedAt) return serverTimeLimit;
    const elapsed = Math.floor((Date.now() - new Date(match.startedAt).getTime()) / 1000);
    return Math.max(0, serverTimeLimit - elapsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, match?.startedAt, serverTimeLimit]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    fetchMe();
  }, [_hasHydrated, token]);

  // Fetch/generate AI puzzle if ?ai=1
  // Folosim POST generate-puzzle (nu GET) ca să genereze dacă nu e în cache
  // Ambii jucători ajung la play page aproape simultan — primul apel generează, al doilea primește din cache
  useEffect(() => {
    if (!isAI || !matchId || !token) return;
    setAiLoading(true);
    aiApi.generatePuzzle(matchId, aiLevel, aiTheme, user?.rating)
      .then((r) => setAiPuzzle(r.data))
      .catch(() => {}) // fallback to SAMPLE_INTEGRAMA
      .finally(() => setAiLoading(false));
  }, [isAI, matchId, token]);

  useEffect(() => {
    if (!matchId || !token || !user) return;
    matchesApi.getMatch(matchId).then(async (r) => {
      const m = r.data;
      // Dacă userul nu e în meci dar meciul e waiting → auto-join (acces prin link direct)
      const isPlayer = m?.players?.find((p: any) => p.userId === user.id);
      if (m?.status === 'waiting' && !isPlayer && !isAI) {
        try {
          const joined = await matchesApi.joinMatch(matchId);
          setMatch(joined.data);
          if (joined.data?.status === 'active') setStarted(true);
          return;
        } catch { /* match full sau deja pornit – continuăm fără join */ }
      }
      setMatch(m);
      if (m?.status === 'active') { setStarted(true); }
      if (m?.status === 'abandoned') { router.replace('/dashboard'); return; }
    }).catch((err: any) => {
      if (err?.response?.status === 404) router.replace('/dashboard');
    });

    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.JOIN_MATCH, { matchId });

    // Re-join room when socket reconnects (backend restart / brief disconnect)
    const handleReconnect = () => {
      socket.emit(SOCKET_EVENTS.JOIN_MATCH, { matchId });
    };
    socket.on('connect', handleReconnect);

    socket.on(SOCKET_EVENTS.MATCH_STATE, (m: Match) => {
      setMatch(m);
      if (m.status === 'active') { setCountdown(null); setStarted(true); }
      if (m.status === 'countdown') { setCountdown(3); }
      if (m.status === 'finished') {
        setTimeout(() => router.push(`/games/${gameType}/result?matchId=${matchId}`), 500);
      }
      if (m.status === 'abandoned') {
        router.replace('/dashboard');
      }
    });
    socket.on(SOCKET_EVENTS.MATCH_COUNTDOWN, ({ countdown: c }: { countdown: number }) => setCountdown(c));
    socket.on(SOCKET_EVENTS.MATCH_START, ({ mazeSeed: seed }: { startedAt?: string; mazeSeed?: number }) => {
      setCountdown(null);
      setStarted(true);
      if (seed !== undefined) setMazeSeed(seed);
    });
    socket.on(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, (data: { players: MatchPlayer[] }) => {
      setMatch((prev) => prev ? { ...prev, players: data.players } : prev);
    });
    socket.on(SOCKET_EVENTS.MATCH_FINISHED, (final: Match) => {
      setFinished(true);
      const me = final.players.find((p: any) => p.userId === user?.id);
      if (me) {
        setXpEarned(me.xpGained);
        if ((user?.xp ?? 0) + me.xpGained > 500) setLevelUp({ show: true, level: 2 });
      }
      setTimeout(() => router.push(`/games/${gameType}/result?matchId=${matchId}`), 2000);
    });
    socket.on('opponent_left', () => {
      setOpponentLeft(true);
    });
    socket.on(SOCKET_EVENTS.REACTION_RECEIVED, ({ userId: fromId, emoji }: { userId: string; emoji: string }) => {
      setLastReaction({ userId: fromId, emoji, fromMe: fromId === user?.id });
    });

    // Heartbeat: la fiecare 2s DOAR cât meciul e în 'waiting'
    // Odată ce countdown-ul a început, oprim heartbeat-ul → nu mai interferează cu numerele
    let heartbeatActive = true;
    const heartbeatInterval = setInterval(async () => {
      if (!heartbeatActive) return;
      try {
        const r = await matchesApi.getMatch(matchId);
        const m: Match = r.data;
        if (m.status === 'waiting') {
          // Încă așteptăm → re-join room ca să nu cădem din socket room
          socket.emit(SOCKET_EVENTS.JOIN_MATCH, { matchId });
          setMatch(m);
        } else if (m.status === 'active') {
          heartbeatActive = false;
          setCountdown(null);
          setStarted(true);
        } else if (m.status === 'countdown') {
          // Countdown real gestionat prin socket events → oprim heartbeat-ul
          heartbeatActive = false;
        } else if (m.status === 'finished') {
          heartbeatActive = false;
          setTimeout(() => router.push(`/games/${gameType}/result?matchId=${matchId}`), 500);
        } else if (m.status === 'abandoned') {
          heartbeatActive = false;
          router.replace('/dashboard');
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          heartbeatActive = false;
          router.replace('/dashboard');
        }
      }
    }, 2000);

    mountTimeRef.current = Date.now();

    return () => {
      heartbeatActive = false;
      clearInterval(heartbeatInterval);
      socket.off('connect', handleReconnect);
      socket.off(SOCKET_EVENTS.MATCH_STATE);
      socket.off(SOCKET_EVENTS.MATCH_COUNTDOWN);
      socket.off(SOCKET_EVENTS.MATCH_START);
      socket.off(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE);
      socket.off(SOCKET_EVENTS.MATCH_FINISHED);
      socket.off('opponent_left');
      socket.off(SOCKET_EVENTS.REACTION_RECEIVED);
      // Emit LEAVE_MATCH doar dacă componenta a trăit >500ms
      // Previne React StrictMode double-mount să distrugă match-ul la montare
      if (Date.now() - mountTimeRef.current > 500) {
        socket.emit(SOCKET_EVENTS.LEAVE_MATCH, { matchId });
      }
    };
  }, [matchId, token, user?.id]);

  function handleProgress(correctAnswers: number, mistakes: number, metrics?: Record<string, unknown>) {
    setCorrectWords(correctAnswers);
    setWrongWords(mistakes);
    if (metrics) setLatestMetrics(metrics);
    if (!matchId) return;
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.PLAYER_PROGRESS, { matchId, correctAnswers, mistakes, metrics });
  }

  function handleFinish(correctAnswers: number, mistakes: number, metrics?: Record<string, unknown>) {
    if (metrics) setLatestMetrics(metrics);
    if (!matchId) return;
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.PLAYER_FINISH, { matchId, correctAnswers, mistakes, metrics });
  }

  function handleTimeExpire() {
    if (!matchId) return;
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.PLAYER_FINISH, {
      matchId,
      correctAnswers: correctWords,
      mistakes: wrongWords,
      metrics: latestMetrics,
    });
  }

  const myPlayer = match?.players.find((p: any) => p.userId === user?.id);
  const level = (match?.level as GameLevel) || 1;
  const maxPlayers = MAX_PLAYERS_PER_LEVEL[level];
  const gameDef = getGameByType(gameType);

  if (!mounted) {
    return <div className="game-page min-h-screen bg-white" />;
  }

  return (
    <div className="game-page min-h-screen bg-white">

      {/* Overlay: generare puzzle AI */}
      {aiLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center">
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-2">Se generează puzzle-ul AI</h2>
            <p className="text-gray-400 text-sm">O secundă, se creează întrebările...</p>
            <div className={`mt-5 w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto ${isLabyrinth ? 'border-emerald-500' : 'border-violet-500'}`} />
          </div>
        </div>
      )}

      {/* Overlay: adversarul a abandonat */}
      {opponentLeft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center">
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Ai câștigat!</h2>
            <p className="text-gray-500 text-sm mb-1">Adversarul a abandonat jocul.</p>
            <p className="text-gray-400 text-xs">Se calculează rezultatele...</p>
            <div className={`mt-5 w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto ${isLabyrinth ? 'border-emerald-500' : 'border-violet-500'}`} />
          </div>
        </div>
      )}

      {/* Top navbar */}
      <GameNavbar
        user={user}
        xpGained={xpEarned}
        levelUp={levelUp}
        gameType={gameType}
      />

      {/* Left player sidebar */}
      <PlayerSidebar
        players={(match?.players as any) || []}
        maxPlayers={maxPlayers}
        matchId={matchId}
        gameType={gameType}
        level={level}
        myUserId={user?.id || ''}
        allowInvite={allowInvite}
      />

      {/* Main content */}
      <main className="pt-14 pl-[180px] min-h-screen flex flex-col items-center">
        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className={clsx(
                'text-[120px] font-black leading-none',
                countdown <= 2 ? accent.countdownWarn : accent.countdownMain
              )}>
                {countdown === 0 ? '🚀' : countdown}
              </div>
              <p className="text-gray-500 mt-4 text-lg font-medium">
                {countdown === 0 ? 'Start!' : 'Pregătește-te!'}
              </p>
            </div>
          </div>
        )}

        {/* Timer */}
        <div className="mt-6 mb-2">
          {started && !finished ? (
            <GameTimer seconds={initialGameSeconds} onExpire={handleTimeExpire} />
          ) : match?.status === 'waiting' ? (
            <GameLobbyPanel
              gameDef={gameDef}
              match={match}
              maxPlayers={maxPlayers}
              isAI={isAI}
              allowInvite={allowInvite}
              linkCopied={linkCopied}
              onCopyLink={() => {
                const url = window.location.href;
                navigator.clipboard.writeText(url).then(() => {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 3000);
                });
              }}
            />
          ) : null}
        </div>

        <GameRenderer
          gameType={gameType}
          started={started}
          finished={finished}
          level={level}
          puzzle={puzzle}
          mazeSeed={mazeSeed}
          onProgress={handleProgress}
          onFinish={handleFinish}
        />
      </main>

      {/* AI Chat */}
      {aiAssistantEnabled && <AIChatWidget />}

      {/* Emoji Reactions */}
      {started && !finished && (
        <EmojiReactions
          onSend={(emoji) => {
            const socket = getSocket();
            socket.emit(SOCKET_EVENTS.SEND_REACTION, { matchId, emoji });
          }}
          lastReceived={lastReaction}
        />
      )}
    </div>
  );
}

export default function GamePlayPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <GamePlayPageInner params={params} />
    </Suspense>
  );
}
