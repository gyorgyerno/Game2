'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PUZZLES_BY_LEVEL, LEVEL_NAMES, LEVEL_WORD_COUNTS } from '@/lib/puzzleData';
import { isUnlocked, isCompleted } from '@/store/gameProgress';

const LEVEL_COLORS = [
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
];

const LEVEL_LOCK_BG = [
  'from-emerald-900 to-teal-900',
  'from-sky-900 to-blue-900',
  'from-violet-900 to-purple-900',
  'from-orange-900 to-red-900',
  'from-pink-900 to-rose-900',
];

const LEVEL_ICONS = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

export default function IntegramePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  // After mount, localStorage is available client-side
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Integrame Solo</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-slate-400 mb-8 text-center">
          Ghicește cuvintele orizontale și descoperă cuvântul vertical ascuns!
        </p>

        <div className="grid gap-6">
          {[1, 2, 3, 4, 5].map((level, idx) => {
            const puzzles = PUZZLES_BY_LEVEL[level] ?? [];
            const wordCount = LEVEL_WORD_COUNTS[level];
            const levelName = LEVEL_NAMES[level];
            const gradient = LEVEL_COLORS[idx];
            const lockBg = LEVEL_LOCK_BG[idx];
            const levelUnlocked = !mounted ? (level === 1) : isUnlocked(level, 0);
            const levelDone = mounted && puzzles.every((_, gi) => isCompleted(level, gi));

            return (
              <div
                key={level}
                className={`bg-slate-900 border rounded-2xl overflow-hidden transition-all ${
                  levelUnlocked ? 'border-slate-800' : 'border-slate-800/50 opacity-60'
                }`}
              >
                {/* Level header */}
                <div className={`bg-gradient-to-r ${levelUnlocked ? gradient : lockBg} px-6 py-4 flex items-center justify-between`}>
                  <div>
                    <span className="text-white/70 text-sm font-medium">Nivel {level}</span>
                    <h2 className="text-white text-xl font-bold">
                      {levelName} {levelDone && '✅'}
                    </h2>
                  </div>
                  <div className="text-right">
                    {levelUnlocked ? (
                      <>
                        <div className="text-white text-sm">{LEVEL_ICONS[idx]}</div>
                        <div className="text-white/80 text-xs mt-0.5">{wordCount} cuvinte</div>
                      </>
                    ) : (
                      <div className="text-3xl">🔒</div>
                    )}
                  </div>
                </div>

                {/* Game buttons */}
                <div className="px-6 py-4 grid grid-cols-3 gap-3">
                  {puzzles.map((puzzle, gameIdx) => {
                    const unlocked = !mounted ? (level === 1 && gameIdx === 0) : isUnlocked(level, gameIdx);
                    const completed = mounted && isCompleted(level, gameIdx);

                    if (unlocked) {
                      return (
                        <button
                          key={gameIdx}
                          onClick={() => router.push(`/integrame/play?level=${level}&game=${gameIdx}`)}
                          className="flex flex-col items-center gap-2 p-4 py-6 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 transition-all group min-h-[120px] justify-center"
                        >
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-lg group-hover:scale-110 transition-transform`}>
                            {completed ? '✓' : gameIdx + 1}
                          </div>
                          <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                            Joc {gameIdx + 1}
                          </span>
                          <span className={`text-xs ${completed ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {completed ? 'Completat' : `${puzzle.words.length} cuv.`}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <div
                        key={gameIdx}
                        className="flex flex-col items-center gap-2 p-4 py-6 rounded-xl bg-slate-800/40 border border-slate-800 cursor-not-allowed select-none min-h-[120px] justify-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-500 text-xl">
                          🔒
                        </div>
                        <span className="text-sm font-medium text-slate-600">Joc {gameIdx + 1}</span>
                        <span className="text-xs text-slate-700">Blocat</span>
                      </div>
                    );
                  })}
                </div>

                {!levelUnlocked && (
                  <div className="px-6 pb-4 text-center text-xs text-slate-600">
                    Termină toate jocurile din Nivelul {level - 1} pentru a debloca
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

