'use client';
import { Suspense } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import '../../../globals-game.css';
import CrosswordGrid from '@/components/game/CrosswordGrid';
import LetterTiles from '@/components/game/LetterTiles';
import PlayerSidebar from '@/components/game/PlayerSidebar';
import AIChatWidget from '@/components/game/AIChatWidget';
import GameNavbar from '@/components/game/GameNavbar';
import GameTimer from '@/components/game/GameTimer';
import EmojiReactions from '@/components/game/EmojiReactions';
import { useAuthStore } from '@/store/auth';
import { matchesApi, aiApi } from '@/lib/api';
import { getSocket, SOCKET_EVENTS } from '@/lib/socket';
import { GAME_RULES, Match, MatchPlayer, MAX_PLAYERS_PER_LEVEL, GameLevel } from '@integrame/shared';
import { SAMPLE_INTEGRAMA, shuffleLetters } from '@/lib/puzzles';
import type { CrosswordPuzzle } from '@/components/game/CrosswordGrid';
import clsx from 'clsx';

interface PageProps {
  params: { gameType: string };
}

function GamePlayPageInner({ params }: PageProps) {
  const { gameType } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
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
  const [activeWordId, setActiveWordId] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [aiPuzzle, setAiPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [lastReaction, setLastReaction] = useState<{ userId: string; emoji: string; fromMe: boolean } | null>(null);

  const puzzle: CrosswordPuzzle = aiPuzzle || SAMPLE_INTEGRAMA;
  const rules = GAME_RULES[gameType] || GAME_RULES['integrame'];
  const activeWord = puzzle.words.find((w) => w.id === activeWordId) || puzzle.words[0];
  // Memoizat ca sa nu se amestece literele la fiecare re-render
  // Dependenta pe activeWord?.word (nu doar activeWordId) ca sa se recalculeze si cand se schimba puzzle-ul AI
  const tileLetters = useMemo(() => activeWord ? shuffleLetters(activeWord.word) : [], [activeWord?.word]); // eslint-disable-line react-hooks/exhaustive-deps
  // Calculeaza timpurile ramas corect dupa refresh, pe baza match.startedAt de pe server
  const initialGameSeconds = useMemo(() => {
    if (!started || !match?.startedAt) return rules.timeLimit;
    const elapsed = Math.floor((Date.now() - new Date(match.startedAt).getTime()) / 1000);
    return Math.max(0, rules.timeLimit - elapsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, match?.startedAt]);

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
    if (!matchId || !token) return;
    matchesApi.getMatch(matchId).then((r) => {
      setMatch(r.data);
      if (r.data?.status === 'active') { setStarted(true); }
    }).catch(() => {});

    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.JOIN_MATCH, { matchId });

    socket.on(SOCKET_EVENTS.MATCH_STATE, (m: Match) => {
      setMatch(m);
      // Daca userul se alatura dupa ce meciul a inceput
      if (m.status === 'active') { setCountdown(null); setStarted(true); }
      // Daca meciul e deja terminat (user reconectat), redirecteaza imediat
      if (m.status === 'finished') {
        setTimeout(() => router.push(`/games/${gameType}/result?matchId=${matchId}`), 500);
      }
    });
    socket.on(SOCKET_EVENTS.MATCH_COUNTDOWN, ({ countdown: c }: { countdown: number }) => setCountdown(c));
    socket.on(SOCKET_EVENTS.MATCH_START, () => { setCountdown(null); setStarted(true); });
    socket.on(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, (data: { players: MatchPlayer[] }) => {
      setMatch((prev) => prev ? { ...prev, players: data.players } : prev);
    });
    socket.on(SOCKET_EVENTS.MATCH_FINISHED, (final: Match) => {
      setFinished(true);
      const me = final.players.find((p: any) => p.userId === user?.id);
      if (me) {
        setXpEarned(me.xpGained);
        // Check level up (simplified)
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

    return () => {
      socket.off(SOCKET_EVENTS.MATCH_STATE);
      socket.off(SOCKET_EVENTS.MATCH_COUNTDOWN);
      socket.off(SOCKET_EVENTS.MATCH_START);
      socket.off(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE);
      socket.off(SOCKET_EVENTS.MATCH_FINISHED);
      socket.off('opponent_left');
      socket.off(SOCKET_EVENTS.REACTION_RECEIVED);
      socket.emit(SOCKET_EVENTS.LEAVE_MATCH, { matchId });
    };
  }, [matchId, token]);

  function handleWordComplete(wordId: number, correct: boolean) {
    if (correct) setCorrectWords((n) => n + 1);
    else setWrongWords((n) => n + 1);

    if (!matchId) return;
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.PLAYER_PROGRESS, {
      matchId,
      correctAnswers: correctWords + (correct ? 1 : 0),
      mistakes: wrongWords + (!correct ? 1 : 0),
    });
  }

  function handleAllComplete(correct: number, total: number) {
    if (!matchId) return;
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.PLAYER_FINISH, {
      matchId,
      correctAnswers: correct,
      mistakes: total - correct,
    });
  }

  function handleTimeExpire() {
    if (!matchId) return;
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.PLAYER_FINISH, {
      matchId,
      correctAnswers: correctWords,
      mistakes: wrongWords,
    });
  }

  const myPlayer = match?.players.find((p: any) => p.userId === user?.id);
  const level = (match?.level as GameLevel) || 1;
  const maxPlayers = MAX_PLAYERS_PER_LEVEL[level];

  return (
    <div className="game-page min-h-screen bg-white">

      {/* Overlay: generare puzzle AI */}
      {aiLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center">
            <div className="text-5xl mb-4">🤖</div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-2">Se generează puzzle-ul AI</h2>
            <p className="text-gray-400 text-sm">O secundă, se creează întrebările...</p>
            <div className="mt-5 w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
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
            <div className="mt-5 w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
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
      />

      {/* Main content */}
      <main className="pt-14 pl-[180px] min-h-screen flex flex-col items-center">
        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className={clsx(
                'text-[120px] font-black leading-none',
                countdown <= 2 ? 'text-red-500' : 'text-violet-600'
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
            <div className="flex flex-col items-center gap-3">
              {isAI && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 border border-violet-300 text-violet-700 text-sm font-semibold">
                  🤖 Puzzle generat de AI – întrebări unice!
                </div>
              )}
              <p className="text-gray-500 text-sm font-medium">
                {match.players.length === maxPlayers
                  ? '✅ Toți jucătorii sunt pregătiți!'
                  : `⏳ Se așteaptă jucători... (${match.players.length}/${maxPlayers})`}
              </p>
              <p className="text-gray-400 text-xs">Meciul pornește automat când sunt toți prezenți</p>
              {match.players.length < maxPlayers && (
                <button
                  onClick={() => {
                    const url = window.location.href;
                    navigator.clipboard.writeText(url).then(() => {
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 3000);
                    });
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    linkCopied
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100'
                  }`}
                >
                  {linkCopied ? (
                    <><span>✓</span> Link copiat!</>
                  ) : (
                    <><span>🔗</span> Invită un prieten</>
                  )}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Crossword + tiles */}
        <div className="flex flex-col items-center gap-8 px-6 pb-32 w-full max-w-2xl">
          <CrosswordGrid
            key={puzzle.title}
            puzzle={puzzle}
            onWordComplete={handleWordComplete}
            onAllComplete={handleAllComplete}
            onActiveWordChange={(w) => { if (w) setActiveWordId(w.id); }}
            readonly={!started || finished}
          />

          {/* Letter tiles */}
          {started && !finished && (
            <div className="flex flex-col items-center gap-3 w-full">
              {/* Intrebarea / definitia pentru cuvantul activ */}
              {activeWord && activeWord.direction === 'horizontal' && activeWord.clue && (
                <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-50 border border-violet-200 text-sm max-w-lg text-center">
                  <span className="text-violet-400 font-semibold shrink-0">{activeWord.id}.</span>
                  <span className="text-gray-700 font-medium">{activeWord.clue}</span>
                </div>
              )}
              <LetterTiles letters={tileLetters} />
              {/* DEV: Rezolvare pentru test */}
              {activeWord && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200 text-sm">
                  <span className="text-slate-400 font-medium">Rezolvare:</span>
                  <span className="font-bold tracking-widest text-violet-600">{activeWord.word}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* AI Chat */}
      <AIChatWidget
        currentWordLength={activeWord?.word.length}
        currentWord={activeWord?.word}
      />

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
