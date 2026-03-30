'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { hydrateMazeProgressFromServer } from '@/store/mazeSoloProgress';

const MAZE_SHAPES = [
  { id: 'rectangle', label: 'Dreptunghi', emoji: '▭' },
  { id: 'circle', label: 'Cerc', emoji: '◯' },
  { id: 'triangle', label: 'Triunghi', emoji: '△' },
  { id: 'hexagon', label: 'Hexagon', emoji: '⬡' },
] as const;

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

type MazeLevelConfig = {
  level: number;
  displayName: string;
  gamesPerLevel: number;
};

const DEFAULT_MAZE_LEVELS: MazeLevelConfig[] = [1, 2, 3, 4, 5].map((level) => ({
  level,
  displayName: `Nivel ${level}`,
  gamesPerLevel: 4,
}));

export default function LabirinturiSoloPage() {
  const [mounted, setMounted] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [levelConfigs, setLevelConfigs] = useState<MazeLevelConfig[]>(DEFAULT_MAZE_LEVELS);

  useEffect(() => {
    setMounted(true);
    hydrateMazeProgressFromServer().then(setCompleted);
  }, []);

  useEffect(() => {
    api.get<Array<{ level: number; displayName: string; gamesPerLevel: number }>>('/games/levels/labirinturi')
      .then((r) => {
        if (!Array.isArray(r.data) || r.data.length === 0) return;
        setLevelConfigs([...r.data].sort((a, b) => a.level - b.level));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Labirinturi Solo</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-slate-400 mb-8 text-center">
          Găsește ieșirea cât mai rapid și evită pereții pe nivelurile dificile.
        </p>

        <div className="grid gap-6">
          {levelConfigs.map((cfg, idx) => {
            const level = cfg.level;
            const configuredGamesCount = cfg.gamesPerLevel ?? 4;
            const playableGamesCount = Math.min(configuredGamesCount, MAZE_SHAPES.length);
            const missingGamesCount = Math.max(0, configuredGamesCount - playableGamesCount);
            const prevCfg = levelConfigs.find((entry) => entry.level === level - 1);
            const prevPlayableGamesCount = Math.min(prevCfg?.gamesPerLevel ?? 4, MAZE_SHAPES.length);
            const levelUnlocked = !mounted
              ? level === levelConfigs[0]?.level
              : level === levelConfigs[0]?.level || Array.from({ length: prevPlayableGamesCount }, (_v, gameIdx) => completed.has(`${level - 1}-${gameIdx}`)).every(Boolean);
            const levelDone = mounted && Array.from({ length: playableGamesCount }, (_v, gameIdx) => completed.has(`${level}-${gameIdx}`)).every(Boolean);
            const gradient = LEVEL_COLORS[idx];
            const lockBg = LEVEL_LOCK_BG[idx];

            return (
              <div
                key={level}
                className={`bg-slate-900 border rounded-2xl overflow-hidden transition-all ${
                  levelUnlocked ? 'border-slate-800' : 'border-slate-800/50 opacity-60'
                }`}
              >
                <div className={`bg-gradient-to-r ${levelUnlocked ? gradient : lockBg} px-6 py-4 flex items-center justify-between`}>
                  <div>
                    <span className="text-white/70 text-sm font-medium">Nivel {level}</span>
                    <h2 className="text-white text-xl font-bold">
                      {cfg.displayName || `Nivel ${level}`} {levelDone && '✅'}
                    </h2>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${levelUnlocked ? 'text-white' : 'text-white/50'}`}>
                      🌀 {configuredGamesCount} jocuri
                    </div>
                    <div className={`text-xs mt-0.5 ${levelUnlocked ? 'text-white/80' : 'text-white/40'}`}>
                      {MAZE_SHAPES.slice(0, playableGamesCount).map((s) => s.emoji).join(' · ')}
                    </div>
                    {!levelUnlocked && <div className="text-lg mt-1">🔒</div>}
                  </div>
                </div>

                {missingGamesCount > 0 && (
                  <div className="px-6 py-3 text-xs text-amber-200 bg-amber-950/40 border-t border-amber-500/20">
                    Configurat: {configuredGamesCount} jocuri. Disponibile acum: {playableGamesCount}. Restul sunt în curs de publicare.
                  </div>
                )}

                <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {MAZE_SHAPES.slice(0, playableGamesCount).map((shape, gameIdx) => {
                    const unlocked = !mounted
                      ? (level === levelConfigs[0]?.level && gameIdx === 0)
                      : (gameIdx === 0
                        ? level === levelConfigs[0]?.level || Array.from({ length: prevPlayableGamesCount }, (_v, idx2) => completed.has(`${level - 1}-${idx2}`)).every(Boolean)
                        : completed.has(`${level}-${gameIdx - 1}`));
                    const done = mounted && completed.has(`${level}-${gameIdx}`);

                    if (unlocked) {
                      return (
                        <Link
                          key={shape.id}
                          href={`/labirinturi/play?level=${level}&game=${gameIdx}&shape=${shape.id}`}
                          className="flex flex-col items-center gap-2 p-4 py-6 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 transition-all group min-h-[120px] justify-center"
                        >
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-lg group-hover:scale-110 transition-transform`}>
                            {done ? '✓' : shape.emoji}
                          </div>
                          <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                            {shape.label}
                          </span>
                          <span className={`text-xs ${done ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {done ? 'Completat' : `Joc ${gameIdx + 1}`}
                          </span>
                        </Link>
                      );
                    }

                    return (
                      <div
                        key={shape.id}
                        className="flex flex-col items-center gap-2 p-4 py-6 rounded-xl bg-slate-800/40 border border-slate-800 cursor-not-allowed select-none min-h-[120px] justify-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-500 text-xl">
                          🔒
                        </div>
                        <span className="text-sm font-medium text-slate-600">{shape.label}</span>
                        <span className="text-xs text-slate-700">Blocat</span>
                      </div>
                    );
                  })}

                  {Array.from({ length: missingGamesCount }, (_v, missingIdx) => {
                    const gameNumber = playableGamesCount + missingIdx + 1;
                    return (
                      <div
                        key={`missing-${level}-${gameNumber}`}
                        className="flex flex-col items-center gap-2 p-4 py-6 rounded-xl bg-amber-950/20 border border-dashed border-amber-700/40 select-none min-h-[120px] justify-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-amber-900/50 flex items-center justify-center text-amber-300 text-xl">…</div>
                        <span className="text-sm font-medium text-amber-100">Joc {gameNumber}</span>
                        <span className="text-xs text-amber-300/80">În curând</span>
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
