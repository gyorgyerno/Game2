'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PUZZLES_BY_LEVEL, LEVEL_WORD_COUNTS } from '@/lib/puzzleData';
import { hydrateIntegrameProgressFromServer, isUnlocked, isCompleted } from '@/store/gameProgress';
import { api } from '@/lib/api';

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

type IntegrameLevelConfig = {
  level: number;
  displayName: string;
  gamesPerLevel: number;
  winsToUnlock: number;
};

const DEFAULT_INTEGRAME_LEVELS: IntegrameLevelConfig[] = [1, 2, 3, 4, 5].map((l) => ({
  level: l,
  displayName: `Nivel ${l}`,
  gamesPerLevel: 3,
  winsToUnlock: 3,
}));

export default function IntegramePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [levelConfigs, setLevelConfigs] = useState<IntegrameLevelConfig[]>(DEFAULT_INTEGRAME_LEVELS);

  useEffect(() => {
    setMounted(true);
    hydrateIntegrameProgressFromServer()
      .catch(() => {})
      .finally(() => setProgressLoaded(true));
  }, []);

  useEffect(() => {
    api.get<Array<{ level: number; displayName: string; gamesPerLevel: number; winsToUnlock: number }>>('/games/levels/integrame')
      .then((r) => {
        if (!Array.isArray(r.data) || r.data.length === 0) return;
        setLevelConfigs([...r.data].sort((a, b) => a.level - b.level));
      })
      .catch(() => {});
  }, []);

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
          {levelConfigs.map((cfg, idx) => {
            const level = cfg.level;
            const allPuzzles = PUZZLES_BY_LEVEL[level] ?? [];
            const configuredGamesCount = cfg.gamesPerLevel;
            const availableGamesCount = allPuzzles.length;
            const effectiveGamesCount = Math.min(configuredGamesCount, availableGamesCount);
            const puzzles = allPuzzles.slice(0, effectiveGamesCount);
            const missingGamesCount = Math.max(0, configuredGamesCount - availableGamesCount);
            const wordCount = LEVEL_WORD_COUNTS[level];
            const levelName = cfg.displayName;
            const gradient = LEVEL_COLORS[idx % LEVEL_COLORS.length];
            const lockBg = LEVEL_LOCK_BG[idx % LEVEL_LOCK_BG.length];
            // Determine how many wins from prev level are needed to unlock this level
            const prevCfg = levelConfigs.find((c) => c.level === level - 1);
            const prevEffective = prevCfg ? Math.min(prevCfg.gamesPerLevel, (PUZZLES_BY_LEVEL[prevCfg.level] ?? []).length) : 0;
            const requiredWins = Math.min(cfg.winsToUnlock, prevEffective || cfg.winsToUnlock);
            const levelUnlocked = !mounted || !progressLoaded
              ? (level === levelConfigs[0]?.level)
              : isUnlocked(level, 0, requiredWins);
            const levelDone = mounted && progressLoaded && puzzles.every((_, gi) => isCompleted(level, gi));

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
                    <div className={`text-sm font-semibold ${levelUnlocked ? 'text-white' : 'text-white/50'}`}>
                      📝 {configuredGamesCount} jocuri
                    </div>
                    <div className={`text-xs mt-0.5 ${levelUnlocked ? 'text-white/80' : 'text-white/40'}`}>
                      {wordCount} cuvinte/joc
                    </div>
                    {!levelUnlocked && <div className="text-lg mt-1">🔒</div>}
                  </div>
                </div>

                {missingGamesCount > 0 && (
                  <div className="px-6 py-3 text-xs text-amber-200 bg-amber-950/40 border-t border-amber-500/20">
                    Configurat: {configuredGamesCount} jocuri. Disponibile acum: {availableGamesCount}. Restul sunt marcate ca in curs de publicare.
                  </div>
                )}

                {/* Game buttons */}
                <div className="px-6 py-4 grid grid-cols-3 gap-3">
                  {puzzles.map((puzzle, gameIdx) => {
                    const unlocked = !mounted || !progressLoaded ? (level === levelConfigs[0]?.level && gameIdx === 0) : isUnlocked(level, gameIdx, requiredWins);
                    const completed = mounted && progressLoaded && isCompleted(level, gameIdx);

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

                  {Array.from({ length: missingGamesCount }, (_, missingIdx) => {
                    const gameNumber = effectiveGamesCount + missingIdx + 1;
                    return (
                      <div
                        key={`missing-${level}-${gameNumber}`}
                        className="flex flex-col items-center gap-2 p-4 py-6 rounded-xl bg-amber-950/20 border border-dashed border-amber-700/40 select-none min-h-[120px] justify-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-amber-900/50 flex items-center justify-center text-amber-300 text-xl">
                          …
                        </div>
                        <span className="text-sm font-medium text-amber-100">Joc {gameNumber}</span>
                        <span className="text-xs text-amber-300/80">In curand</span>
                      </div>
                    );
                  })}
                </div>

                {!levelUnlocked && (
                  <div className="px-6 pb-4 text-center text-xs text-slate-600">
                    Completează {requiredWins} {requiredWins === 1 ? 'joc' : 'jocuri'} din Nivelul {level - 1} pentru a debloca
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

