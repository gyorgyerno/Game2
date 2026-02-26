'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import CrosswordGrid, { CrosswordWord } from '@/components/game/CrosswordGrid';
import LetterTiles from '@/components/game/LetterTiles';
import { getPuzzleById, getLevelForPuzzle, getNextPuzzle, SoloPuzzle } from '@/lib/soloData';
import { shuffleLetters } from '@/lib/puzzles';
import { ArrowLeft, Trophy, ChevronRight, RotateCcw, HelpCircle } from 'lucide-react';

const STORAGE_KEY = 'integrame_solo_completed';

function markCompleted(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(id)) {
      set.push(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(set));
    }
  } catch {
    /* ignore */
  }
}

// ────────────────────────────────────────────────────────────────────────────

function SoloPlayInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const puzzleId = searchParams.get('id') ?? '';

  const [puzzle, setPuzzle] = useState<SoloPuzzle | null>(null);
  const [activeWord, setActiveWord] = useState<CrosswordWord | null>(null);
  const [shuffled, setShuffled] = useState<string[]>([]);
  const [tileKey, setTileKey] = useState(0);           // force re-mount tiles
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [gameState, setGameState] = useState<'playing' | 'won'>('playing');
  const [secretRevealed, setSecretRevealed] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [gridKey, setGridKey] = useState(0);           // force grid reset

  // Timer
  useEffect(() => {
    if (gameState !== 'playing') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [gameState]);

  // Load puzzle
  useEffect(() => {
    const p = getPuzzleById(puzzleId);
    if (!p) {
      router.replace('/solo');
      return;
    }
    setPuzzle(p);
    setGameState('playing');
    setWordsCompleted(0);
    setSecretRevealed([]);
    // Restore timer from sessionStorage to survive page refreshes
    const timerKey = `solo_timer_${puzzleId}`;
    const saved = sessionStorage.getItem(timerKey);
    if (saved) {
      setElapsed(Math.floor((Date.now() - parseInt(saved)) / 1000));
    } else {
      sessionStorage.setItem(timerKey, Date.now().toString());
      setElapsed(0);
    }
  }, [puzzleId]);

  // Update shuffled letters when active word changes
  useEffect(() => {
    if (!activeWord) { setShuffled([]); return; }
    setShuffled(shuffleLetters(activeWord.word));
    setTileKey((k) => k + 1);
  }, [activeWord?.id]);

  const handleActiveWordChange = useCallback((word: CrosswordWord | null) => {
    setActiveWord(word);
  }, []);

  const handleWordComplete = useCallback(
    (_wordId: number, correct: boolean) => {
      if (correct) {
        setWordsCompleted((n) => n + 1);
        // Dezvăluie litera corespunzătoare din cuvântul secret
        if (puzzle) {
          const word = puzzle.words.find((w) => w.id === _wordId);
          if (word) {
            const secretIdx = word.row; // rândul cuvântului = indexul din secretWord
            setSecretRevealed((prev) => {
              const updated = [...prev];
              updated[secretIdx] = puzzle.secretWord[secretIdx];
              return updated;
            });
          }
        }
      }
    },
    [puzzle]
  );

  const handleAllComplete = useCallback(
    (correct: number, total: number) => {
      if (correct === total && puzzle) {
        markCompleted(puzzle.id);
        sessionStorage.removeItem(`solo_timer_${puzzle.id}`);
        setGameState('won');
      }
    },
    [puzzle]
  );

  const handleWrongLetter = useCallback(() => {
    // Re-mount tiles so the "wrong" tile becomes clickable again
    setTileKey((k) => k + 1);
  }, []);

  const handleRestart = () => {
    setWordsCompleted(0);
    setGameState('playing');
    setSecretRevealed([]);
    setGridKey((k) => k + 1);
    setTileKey((k) => k + 1);
    // Reset timer in sessionStorage
    const timerKey = `solo_timer_${puzzleId}`;
    sessionStorage.setItem(timerKey, Date.now().toString());
    setElapsed(0);
  };

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  if (!puzzle) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="animate-pulse text-xl">Se încarcă puzzle-ul…</div>
      </div>
    );
  }

  const levelNo = getLevelForPuzzle(puzzle.id);
  const nextPuzzle = getNextPuzzle(puzzle.id);
  const totalWords = puzzle.words.length;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* ── Header ── */}
      <div className="bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/solo"
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Solo
          </Link>
          <div className="h-4 w-px bg-gray-700" />
          <span className="text-sm font-medium text-white truncate">
            Nivel {levelNo} — {puzzle.title}
          </span>
          <div className="ml-auto flex items-center gap-4">
            {/* Progres cuvinte */}
            <div className="hidden sm:flex gap-1 items-center">
              {puzzle.words.map((w, i) => (
                <div
                  key={w.id}
                  className={`w-3 h-3 rounded-full transition-all ${
                    wordsCompleted > i ? 'bg-purple-500' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
            {/* Timer */}
            <span className="text-sm font-mono text-gray-400">
              ⏱ {formatTime(elapsed)}
            </span>
            {/* Restart */}
            <button
              onClick={handleRestart}
              className="text-gray-500 hover:text-white transition-colors"
              title="Restart"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Joc ── */}
      <div className="flex-1 flex flex-col items-center justify-start py-6 px-4 gap-6 max-w-3xl mx-auto w-full">
        {gameState === 'won' ? (
          /* ── Ecran victorie ── */
          <div className="flex flex-col items-center gap-6 mt-8 text-center w-full max-w-md">
            <div className="w-24 h-24 rounded-full bg-purple-500/20 flex items-center justify-center animate-bounce">
              <Trophy size={48} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white mb-1">Felicitări! 🎉</h2>
              <p className="text-gray-400">
                Ai completat <span className="text-white font-bold">{puzzle.title}</span> în{' '}
                <span className="text-purple-400 font-bold">{formatTime(elapsed)}</span>
              </p>
            </div>

            {/* Cuvântul secret dezvăluit */}
            <div className="bg-purple-900/30 border border-purple-500/40 rounded-2xl px-8 py-6 w-full">
              <p className="text-sm text-purple-300 mb-2 uppercase tracking-widest">
                Cuvântul secret
              </p>
              <div className="flex gap-2 justify-center mb-3">
                {puzzle.secretWord.split('').map((l, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-xl font-black text-white"
                  >
                    {l}
                  </div>
                ))}
              </div>
              <p className="text-gray-300 text-sm italic">„{puzzle.secretClue}"</p>
            </div>

            {/* Stele */}
            <div className="flex gap-2">
              {[1, 2, 3].map((star) => (
                <div
                  key={star}
                  className="text-3xl"
                  style={{
                    animationDelay: `${star * 0.2}s`,
                    animation: 'bounce 1s ease-in-out infinite alternate',
                  }}
                >
                  ⭐
                </div>
              ))}
            </div>

            {/* Butoane */}
            <div className="flex gap-3 w-full">
              <button
                onClick={handleRestart}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl py-3 transition"
              >
                <RotateCcw size={16} />
                Joacă iar
              </button>
              {nextPuzzle ? (
                <button
                  onClick={() =>
                    router.push(`/solo/play?id=${nextPuzzle.id}`)
                  }
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 transition font-bold"
                >
                  Următor
                  <ChevronRight size={16} />
                </button>
              ) : (
                <Link
                  href="/solo"
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 transition font-bold text-center"
                >
                  Toate nivelele
                </Link>
              )}
            </div>
          </div>
        ) : (
          /* ── Joc activ ── */
          <>
            {/* Indiciu cuvânt activ */}
            <div className="w-full bg-gray-900 rounded-2xl px-5 py-4 border border-gray-800 min-h-[68px]">
              {activeWord ? (
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center mt-0.5">
                    <HelpCircle size={16} className="text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                      Cuvântul #{activeWord.id} · {activeWord.word.length} litere
                    </p>
                    <p className="text-white font-medium leading-snug">
                      {activeWord.clue}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm italic">
                  Dă click pe un cuvânt din schemă…
                </p>
              )}
            </div>

            {/* Progres cuvânt secret (coloana violet) */}
            <div className="flex items-center gap-2 self-start">
              <span className="text-xs text-gray-500 uppercase tracking-widest">
                Cuvânt secret:
              </span>
              {puzzle.secretWord.split('').map((letter, i) => (
                <div
                  key={i}
                  className={`w-7 h-7 rounded border flex items-center justify-center text-sm font-bold transition-all ${
                    secretRevealed[i]
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-700'
                  }`}
                >
                  {secretRevealed[i] ?? '?'}
                </div>
              ))}
            </div>

            {/* Grid crossword */}
            <div className="w-full overflow-x-auto">
              <CrosswordGrid
                key={gridKey}
                puzzle={puzzle}
                onActiveWordChange={handleActiveWordChange}
                onWordComplete={handleWordComplete}
                onAllComplete={handleAllComplete}
                onWrongLetter={handleWrongLetter}
              />
            </div>

            {/* Litere disponibile */}
            {shuffled.length > 0 && (
              <div className="w-full bg-gray-900 rounded-2xl px-4 py-4 border border-gray-800">
                <p className="text-xs text-gray-500 text-center mb-3 uppercase tracking-widest">
                  Litere disponibile
                </p>
                <LetterTiles
                  key={tileKey}
                  letters={shuffled}
                />
              </div>
            )}

            {/* Bară progres inferior */}
            <div className="w-full flex items-center gap-3 text-sm text-gray-400">
              <span>{wordsCompleted}/{totalWords} cuvinte</span>
              <div className="flex-1 bg-gray-800 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-purple-500 transition-all"
                  style={{ width: `${(wordsCompleted / totalWords) * 100}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Export cu Suspense boundary (cerut de useSearchParams în Next.js 14)
// ────────────────────────────────────────────────────────────────────────────

export default function SoloPlayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
          <div className="animate-pulse text-xl">Se încarcă…</div>
        </div>
      }
    >
      <SoloPlayInner />
    </Suspense>
  );
}
