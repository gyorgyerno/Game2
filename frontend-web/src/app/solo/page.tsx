'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SOLO_LEVELS, SoloPuzzle } from '@/lib/soloData';
import { ArrowLeft, Lock, CheckCircle, PlayCircle, Star } from 'lucide-react';

const STORAGE_KEY = 'integrame_solo_completed';

function getCompleted(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export default function SoloPage() {
  const router = useRouter();
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  useEffect(() => {
    setCompleted(getCompleted());
  }, []);

  // Un nivel este deblocat dacă TOATE puzzle-urile din nivelul ANTERIOR sunt completate
  // (Level 1 este mereu deblocat)
  function isLevelUnlocked(levelIndex: number): boolean {
    if (levelIndex === 0) return true;
    const prevLevel = SOLO_LEVELS[levelIndex - 1];
    return prevLevel.puzzles.every((p) => completed.has(p.id));
  }

  function isPuzzleUnlocked(levelIndex: number, puzzleIndex: number): boolean {
    if (!isLevelUnlocked(levelIndex)) return false;
    if (puzzleIndex === 0) return true;
    // Fiecare puzzle următor se deblochează când prev e completat
    const prevPuzzle = SOLO_LEVELS[levelIndex].puzzles[puzzleIndex - 1];
    return completed.has(prevPuzzle.id);
  }

  function completedInLevel(level: typeof SOLO_LEVELS[0]): number {
    return level.puzzles.filter((p) => completed.has(p.id)).length;
  }

  const currentLevel = selectedLevel !== null ? SOLO_LEVELS[selectedLevel] : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Dashboard</span>
          </Link>
          <div className="h-6 w-px bg-gray-700" />
          <div>
            <h1 className="text-xl font-bold text-white">
              🧩 Integrame Solo
            </h1>
            <p className="text-xs text-gray-400">
              {completed.size} / 15 puzzle-uri completate
            </p>
          </div>
          {/* Progress global */}
          <div className="ml-auto flex gap-1">
            {Array.from({ length: 15 }, (_, i) => {
              const lvlIdx = Math.floor(i / 3);
              const puzIdx = i % 3;
              const puzzleId = SOLO_LEVELS[lvlIdx]?.puzzles[puzIdx]?.id;
              return (
                <div
                  key={i}
                  className={`w-2 h-4 rounded-sm transition-colors ${
                    puzzleId && completed.has(puzzleId)
                      ? 'bg-purple-500'
                      : 'bg-gray-700'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {selectedLevel === null ? (
          /* ── Selector nivel ── */
          <>
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">Alege nivelul</h2>
              <p className="text-gray-400">
                Completează puzzle-urile în ordine pentru a debloca nivelele superioare
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SOLO_LEVELS.map((level, idx) => {
                const unlocked = isLevelUnlocked(idx);
                const done = completedInLevel(level);
                const total = level.puzzles.length;
                const allDone = done === total;

                return (
                  <button
                    key={level.level}
                    onClick={() => unlocked && setSelectedLevel(idx)}
                    disabled={!unlocked}
                    className={`relative rounded-2xl p-6 py-8 text-left transition-all border-2 min-h-[220px] ${
                      unlocked
                        ? 'border-transparent hover:scale-105 hover:border-purple-500 cursor-pointer'
                        : 'border-gray-800 opacity-50 cursor-not-allowed'
                    } ${allDone ? 'bg-gray-800 ring-2 ring-purple-500' : 'bg-gray-900'}`}
                    style={unlocked ? { borderColor: level.color + '44' } : {}}
                  >
                    {/* Icon stare */}
                    <div className="absolute top-4 right-4">
                      {!unlocked ? (
                        <Lock size={20} className="text-gray-600" />
                      ) : allDone ? (
                        <CheckCircle size={20} style={{ color: level.color }} />
                      ) : (
                        <PlayCircle size={20} className="text-gray-400" />
                      )}
                    </div>

                    {/* Număr nivel */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black mb-4"
                      style={{
                        background: unlocked ? level.color + '22' : '#1f2937',
                        color: unlocked ? level.color : '#4b5563',
                      }}
                    >
                      {level.level}
                    </div>

                    <h3 className="font-bold text-lg mb-1">{level.label}</h3>
                    <p className="text-sm text-gray-400 mb-4">{level.description}</p>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${(done / total) * 100}%`,
                          background: level.color,
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {done}/{total} completate
                    </p>

                    {/* Stele */}
                    <div className="flex gap-1 mt-3">
                      {level.puzzles.map((p) => (
                        <Star
                          key={p.id}
                          size={14}
                          fill={completed.has(p.id) ? level.color : 'none'}
                          style={{ color: level.color }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          /* ── Selector puzzle din nivel ── */
          <>
            <div className="flex items-center gap-4 mb-8">
              <button
                onClick={() => setSelectedLevel(null)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
                Înapoi
              </button>
              <div>
                <h2 className="text-2xl font-bold">
                  {currentLevel!.label}
                </h2>
                <p className="text-sm text-gray-400">
                  {currentLevel!.description}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {currentLevel!.puzzles.map((puzzle, puzIdx) => {
                const unlocked = isPuzzleUnlocked(selectedLevel, puzIdx);
                const done = completed.has(puzzle.id);

                return (
                  <button
                    key={puzzle.id}
                    onClick={() =>
                      unlocked && router.push(`/solo/play?id=${puzzle.id}`)
                    }
                    disabled={!unlocked}
                    className={`rounded-2xl p-6 py-8 text-left transition-all border-2 min-h-[220px] ${
                      unlocked
                        ? 'bg-gray-900 border-gray-800 hover:border-purple-500 hover:scale-105 cursor-pointer'
                        : 'bg-gray-900 border-gray-800 opacity-40 cursor-not-allowed'
                    } ${done ? 'ring-2 ring-purple-500' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <span className="text-3xl font-black text-gray-500">
                        #{puzIdx + 1}
                      </span>
                      {!unlocked ? (
                        <Lock size={20} className="text-gray-600" />
                      ) : done ? (
                        <CheckCircle size={24} className="text-purple-400" />
                      ) : (
                        <PlayCircle size={24} className="text-gray-400" />
                      )}
                    </div>

                    <h3 className="font-bold text-base mb-1">{puzzle.title}</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      {puzzle.words.length} cuvinte orizontale
                    </p>

                    {/* Mini preview grid */}
                    <div className="grid gap-0.5"
                      style={{
                        gridTemplateColumns: `repeat(${puzzle.cols}, 1fr)`,
                        gridTemplateRows: `repeat(${puzzle.rows}, 1fr)`,
                        maxWidth: 120,
                      }}
                    >
                      {Array.from({ length: puzzle.rows * puzzle.cols }, (_, i) => {
                        const r = Math.floor(i / puzzle.cols);
                        const c = i % puzzle.cols;
                        const isActive = puzzle.words.some(
                          (w) => w.row === r && c >= w.col && c < w.col + w.word.length
                        );
                        const isMain = c === puzzle.mainCol && isActive;
                        return (
                          <div
                            key={i}
                            className="rounded-sm"
                            style={{
                              width: 10,
                              height: 10,
                              background: isMain
                                ? '#a855f7'
                                : isActive
                                ? done
                                  ? '#22c55e44'
                                  : '#374151'
                                : 'transparent',
                            }}
                          />
                        );
                      })}
                    </div>

                    {done && (
                      <p className="text-xs text-purple-400 mt-3 font-medium">
                        ✓ Completat
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
