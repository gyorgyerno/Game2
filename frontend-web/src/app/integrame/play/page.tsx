'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import CrosswordGrid from '@/components/game/CrosswordGrid';
import type { CrosswordWord } from '@/components/game/CrosswordGrid';
import { getPuzzle, LEVEL_NAMES, PUZZLES_BY_LEVEL } from '@/lib/puzzleData';
import { hydrateIntegrameProgressFromServer, isUnlocked, syncIntegrameGameCompletion } from '@/store/gameProgress';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import '../../globals-game.css';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Complete overlay ────────────────────────────────────────────────────────
interface CompleteProps {
  secret: string;
  correctCount: number;
  totalCount: number;
  level: number;
  gameIndex: number;
  gamesPerLevel: number;
  onNext: () => void;
  onMenu: () => void;
}

function CompleteOverlay({ secret, correctCount, totalCount, level, gameIndex, gamesPerLevel, onNext, onMenu }: CompleteProps) {
  const isLast = gameIndex >= gamesPerLevel - 1;
  const pct = Math.round((correctCount / totalCount) * 100);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center">
        <div className="text-5xl mb-4">{pct === 100 ? '🏆' : pct >= 60 ? '🎉' : '💪'}</div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-1">
          {pct === 100 ? 'Perfect!' : pct >= 60 ? 'Bravo!' : 'Aproape!'}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {correctCount} din {totalCount} cuvinte corecte
        </p>

        <div className="bg-violet-50 border border-violet-200 rounded-2xl px-6 py-4 mb-6">
          <p className="text-xs text-violet-500 font-semibold uppercase tracking-wider mb-2">
            Cuvântul secret era
          </p>
          <div className="flex justify-center gap-1.5 flex-wrap">
            {secret.split('').map((ch, i) => (
              <span key={i} className="w-10 h-10 flex items-center justify-center bg-violet-600 text-white font-bold text-lg rounded-lg">
                {ch}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {!isLast ? (
            <button onClick={onNext} className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition-colors">
              Joc următor →
            </button>
          ) : (
            <p className="text-sm text-gray-500">Ai terminat toate jocurile din Nivelul {level}! 🎊</p>
          )}
          <button onClick={onMenu} className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-xl transition-colors">
            Înapoi la niveluri
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main game ───────────────────────────────────────────────────────────────
function PlayContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuthStore();

  const level = Number(params.get('level') ?? '1');
  const gameIndex = Number(params.get('game') ?? '0');
  const puzzle = getPuzzle(level, gameIndex);
  const availableGamesCount = PUZZLES_BY_LEVEL[level]?.length ?? 0;
  const availablePrevLevelGamesCount = PUZZLES_BY_LEVEL[level - 1]?.length ?? 0;

  // levels config and hydrated progress
  const [progressReady, setProgressReady] = useState(false);
  const [levelGamesConfig, setLevelGamesConfig] = useState<Record<number, number>>({});
  useEffect(() => {
    api.get<Array<{ level: number; gamesPerLevel: number }>>('/games/levels/integrame')
      .then((r) => {
        const map: Record<number, number> = {};
        for (const item of r.data) map[item.level] = item.gamesPerLevel;
        setLevelGamesConfig(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    hydrateIntegrameProgressFromServer()
      .catch(() => {})
      .finally(() => setProgressReady(true));
  }, []);

  // Redirect if locked
  useEffect(() => {
    if (!progressReady) return;
    const prevLevelGames = levelGamesConfig[level - 1] ?? 3;
    const effectivePrevLevelGames = Math.min(prevLevelGames, Math.max(availablePrevLevelGamesCount, 1));
    if (!puzzle || !isUnlocked(level, gameIndex, effectivePrevLevelGames)) router.replace('/integrame');
  }, [availablePrevLevelGamesCount, gameIndex, level, levelGamesConfig, progressReady, puzzle, router]);

  // Timer (count-up)
  const [elapsed, setElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(true);
  useEffect(() => {
    if (!timerActive) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [timerActive]);
  // Restore timer from sessionStorage to survive page refreshes
  useEffect(() => {
    const timerKey = `integrame_timer_${level}_${gameIndex}`;
    const saved = sessionStorage.getItem(timerKey);
    if (saved) {
      setElapsed(Math.floor((Date.now() - parseInt(saved)) / 1000));
    } else {
      sessionStorage.setItem(timerKey, Date.now().toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tile state
  const [tiles, setTiles] = useState<{ letter: string; used: boolean }[]>([]);
  const [activeClue, setActiveClue] = useState<string>('');
  const [activeWordLen, setActiveWordLen] = useState(0);
  const lastUsedIdxRef = useRef<number | null>(null);

  // Complete overlay
  const [completeData, setCompleteData] = useState<{ correct: number; total: number } | null>(null);
  const [completedWordIds, setCompletedWordIds] = useState<Set<number>>(new Set());

  const handleActiveWordChange = useCallback((word: CrosswordWord | null) => {
    if (!word) { setTiles([]); setActiveClue(''); setActiveWordLen(0); return; }
    setActiveClue(word.clue);
    setActiveWordLen(word.word.length);
    const shuffled = shuffle(word.word.toUpperCase().split(''));
    setTiles(shuffled.map((l) => ({ letter: l, used: false })));
    lastUsedIdxRef.current = null;
  }, []);

  const handleWrongLetter = useCallback(() => {
    const idx = lastUsedIdxRef.current;
    if (idx === null) return;
    setTiles((prev) => prev.map((t, i) => i === idx ? { ...t, used: false } : t));
    lastUsedIdxRef.current = null;
  }, []);

  function handleTileClick(letter: string, idx: number) {
    if (tiles[idx].used) return;
    setTiles((prev) => prev.map((t, i) => i === idx ? { ...t, used: true } : t));
    lastUsedIdxRef.current = idx;
    (window as any).__crosswordInput?.(letter);
  }

  const handleWordComplete = useCallback((wordId: number) => {
    setCompletedWordIds((prev) => new Set([...prev, wordId]));
  }, []);

  const handleAllComplete = useCallback((correct: number, total: number) => {
    void syncIntegrameGameCompletion(level, gameIndex);
    sessionStorage.removeItem(`integrame_timer_${level}_${gameIndex}`);
    setTimerActive(false);
    setCompleteData({ correct, total });
  }, [level, gameIndex]);

  if (!puzzle) return (
    <div className="game-page min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Joc negăsit.</p>
    </div>
  );

  const totalWords = puzzle.words.length;
  const doneCount = completedWordIds.size;
  const avatarUrl = user?.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${user?.username ?? 'guest'}`;
  const configuredGamesPerLevel = levelGamesConfig[level] ?? 3;
  const gamesPerLevel = Math.min(configuredGamesPerLevel, availableGamesCount || configuredGamesPerLevel);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timerStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div className="game-page min-h-screen flex flex-col">

      {/* ── Navbar (matches design) ─────────────────────────────────────── */}
      <nav className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Left: game pill */}
          <button
            onClick={() => router.push('/integrame')}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold px-4 py-2 rounded-full transition-colors"
          >
            <span className="text-violet-400">＋</span>
            Integrame
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="opacity-60"><path d="M2 4l4 4 4-4"/></svg>
          </button>

          {/* Right: XP + level badge + avatar */}
          <div className="flex items-center gap-3">
            {/* XP */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5">
              <span className="text-base">🏆</span>
              <div className="leading-none">
                <p className="text-xs font-black text-gray-900">{user?.xp ?? 0}</p>
                <p className="text-[10px] text-gray-400">XP</p>
              </div>
            </div>

            {/* Level badge */}
            <div className="hidden sm:flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1.5">
              <span className="text-base">👑</span>
              <div className="leading-none">
                <p className="text-[10px] text-yellow-600 font-semibold">Nivel {level}</p>
                <p className="text-xs font-bold text-gray-800">{LEVEL_NAMES[level]}</p>
              </div>
            </div>

            {/* Avatar */}
            <img
              src={avatarUrl}
              alt={user?.username ?? 'guest'}
              className="w-8 h-8 rounded-full border-2 border-violet-400 object-cover"
            />
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-violet-500 transition-all duration-500"
            style={{ width: `${(doneCount / totalWords) * 100}%` }}
          />
        </div>
      </nav>

      {/* ── Game area ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-0">

        {/* Timer */}
        <p className="text-sm text-gray-500 font-medium mb-4 tracking-wide">
          {completeData ? `Terminat în ${timerStr}` : `Timp: ${timerStr}`}
        </p>

        {/* Crossword grid */}
        <CrosswordGrid
          puzzle={puzzle}
          onActiveWordChange={handleActiveWordChange}
          onWrongLetter={handleWrongLetter}
          onWordComplete={handleWordComplete}
          onAllComplete={handleAllComplete}
        />

        {/* Clue — below grid, bold, matches design */}
        <div className="mt-6 mb-5 text-center max-w-md px-2">
          {activeClue ? (
            <>
              <p className="text-gray-900 font-bold text-lg leading-snug">{activeClue}</p>
              <p className="text-xs text-violet-500 mt-1 font-semibold">{activeWordLen} litere</p>
            </>
          ) : (
            <p className="text-gray-300 text-base">Dă click pe un cuvânt din schemă</p>
          )}
        </div>

        {/* Letter tiles — large purple, matches design */}
        {tiles.length > 0 && (
          <div className="flex flex-wrap gap-2.5 justify-center max-w-lg">
            {tiles.map((tile, idx) => (
              <button
                key={idx}
                onClick={() => handleTileClick(tile.letter, idx)}
                disabled={tile.used}
                className={`letter-tile${tile.used ? ' used' : ''}`}
              >
                {tile.letter}
              </button>
            ))}
          </div>
        )}

        {/* Word progress dots */}
        <div className="flex gap-2 mt-6">
          {puzzle.words.map((w) => (
            <div
              key={w.id}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                completedWordIds.has(w.id) ? 'bg-violet-500 scale-125' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Complete overlay */}
      {completeData && (
        <CompleteOverlay
          secret={puzzle.secret}
          correctCount={completeData.correct}
          totalCount={completeData.total}
          level={level}
          gameIndex={gameIndex}
          gamesPerLevel={gamesPerLevel}
          onNext={() => {
            setCompleteData(null);
            setCompletedWordIds(new Set());
            setElapsed(0);
            setTimerActive(true);
            // New timer stored when next puzzle mounts
            sessionStorage.removeItem(`integrame_timer_${level}_${gameIndex + 1}`);
            router.push(`/integrame/play?level=${level}&game=${gameIndex + 1}`);
          }}
          onMenu={() => router.push('/integrame')}
        />
      )}
    </div>
  );
}

export default function IntegramePlayPage() {
  return (
    <Suspense fallback={
      <div className="game-page min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PlayContent />
    </Suspense>
  );
}

