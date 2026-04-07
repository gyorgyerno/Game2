'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const MazePlay = dynamic(() => import('@/games/maze/MazePlay'), { ssr: false });
import GameTimer from '@/components/game/GameTimer';
import { SAMPLE_INTEGRAMA } from '@/lib/puzzles';
import { gamesApi } from '@/lib/api';
import { syncMazeLevelCompletion } from '@/store/mazeSoloProgress';

type MazeShapeVariant = 'rectangle' | 'circle' | 'triangle' | 'hexagon' | 'diamond' | 'cross' | 'octagon' | 'ellipse' | 'arch' | 'arrow';

const SHAPES: Array<{ id: MazeShapeVariant; label: string; emoji: string }> = [
  { id: 'rectangle', label: 'Dreptunghi', emoji: '▭' },
  { id: 'circle',    label: 'Cerc',       emoji: '◯' },
  { id: 'triangle',  label: 'Triunghi',   emoji: '△' },
  { id: 'hexagon',   label: 'Hexagon',    emoji: '⬡' },
  { id: 'diamond',   label: 'Romb',       emoji: '◇' },
  { id: 'cross',     label: 'Cruce',      emoji: '✚' },
  { id: 'octagon',   label: 'Octogon',    emoji: '⯃' },
  { id: 'ellipse',   label: 'Elipsă',     emoji: '⬭' },
  { id: 'arch',      label: 'Arc',        emoji: '⌒' },
  { id: 'arrow',     label: 'Săgeată',    emoji: '↑' },
];

function LabirinturiSoloPlayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const level = Math.max(1, parseInt(searchParams.get('level') || '1', 10));
  const game = Math.max(0, parseInt(searchParams.get('game') || '0', 10));
  const shapeParam = searchParams.get('shape');
  const shape = SHAPES.find((entry) => entry.id === shapeParam)?.id ?? SHAPES[game % SHAPES.length]?.id ?? 'rectangle';
  const shapeMeta = SHAPES.find((entry) => entry.id === shape) ?? SHAPES[0];

  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);

  // Seed-ul în URL → pe refresh același labirint; "Joacă din nou" → seed nou
  const seedParam = searchParams.get('seed');
  const [mazeSeed, setMazeSeed] = useState<number>(() => {
    if (seedParam !== null) {
      const n = parseInt(seedParam, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return Math.floor(Math.random() * 2_147_483_647) + 1;
  });
  const [seedReady, setSeedReady] = useState(seedParam !== null);
  const didInjectSeed = useRef(false);

  // Dacă nu avem seed în URL, verificăm dacă există pool (aiEnabled=false)
  // și cerem seed din pool; altfel generăm local
  useEffect(() => {
    if (seedParam !== null) return; // seed deja în URL
    gamesApi.getMazePoolSeed(level)
      .then((res) => {
        const { seed: poolSeed, shapeVariant: poolShape } = res.data;
        if (poolSeed != null) {
          const finalShape = (poolShape as typeof shape) ?? shape;
          const newSeed = poolSeed;
          setMazeSeed(newSeed);
          setSeedReady(true);
          router.replace(`/labirinturi/play?level=${level}&game=${game}&shape=${finalShape}&seed=${newSeed}&pool=1`);
        } else {
          // AI activ sau pool gol → seed local
          setSeedReady(true);
          if (!didInjectSeed.current) {
            didInjectSeed.current = true;
            router.replace(`/labirinturi/play?level=${level}&game=${game}&shape=${shape}&seed=${mazeSeed}`);
          }
        }
      })
      .catch(() => {
        setSeedReady(true);
        if (!didInjectSeed.current) {
          didInjectSeed.current = true;
          router.replace(`/labirinturi/play?level=${level}&game=${game}&shape=${shape}&seed=${mazeSeed}`);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [seconds, setSeconds] = useState<number | null>(null);
  const [gameSeconds, setGameSeconds] = useState<number | null>(null);
  const [levelGamesCount, setLevelGamesCount] = useState<number>(4);
  const [levelDifficulty, setLevelDifficulty] = useState<number | undefined>(undefined);
  useEffect(() => {
    gamesApi.getRules('labirinturi')
      .then(res => {
        const total = res.data.timeLimit;
        setSeconds(total);
        if (total > 0) {
          const key = `maze_solo_timer_${mazeSeed}`;
          const saved = sessionStorage.getItem(key);
          if (saved) {
            const { startedAt } = JSON.parse(saved);
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            setGameSeconds(Math.max(1, total - elapsed));
          } else {
            sessionStorage.setItem(key, JSON.stringify({ startedAt: Date.now() }));
            setGameSeconds(total);
          }
        } else {
          setGameSeconds(0);
        }
      })
      .catch(() => { setSeconds(60); setGameSeconds(60); });
    gamesApi.getLevels('labirinturi')
      .then(res => {
        const cfg = res.data.find((l) => l.level === level);
        if (cfg) {
          setLevelGamesCount(cfg.gamesPerLevel);
          setLevelDifficulty(cfg.difficultyValue);
        }
      })
      .catch(() => {});
  }, [level]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {!seedReady && (
        <div className="flex items-center justify-center min-h-screen">
          <span className="text-slate-400 text-sm animate-pulse">Se pregătește labirintul...</span>
        </div>
      )}
      {seedReady && (<>
      <div className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/labirinturi" className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Labirinturi Solo
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Labirinturi · Nivel {level} · Joc {game + 1}</h1>
          <span className="text-sm text-emerald-300 font-semibold">{shapeMeta.emoji} {shapeMeta.label}</span>
          <div className="ml-auto">
            {!finished && gameSeconds !== null && gameSeconds > 0 && (
              <GameTimer key={mazeSeed} seconds={gameSeconds} onExpire={() => {
                sessionStorage.removeItem(`maze_solo_timer_${mazeSeed}`);
                if (score > 0) {
                  syncMazeLevelCompletion(level, game, score, levelGamesCount);
                }
                setFinished(true);
              }} />
            )}
            {!finished && seconds === 0 && (
              <span className="text-emerald-400 font-semibold text-sm">∞ Fără limită de timp</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col items-center">
        {finished && (
          <div className="w-full mb-4 rounded-2xl p-4 text-sm backdrop-blur-xl"
            style={{background:'rgba(16,185,129,0.07)',border:'1px solid rgba(52,211,153,0.22)',boxShadow:'0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.10)'}}>
            <p className="font-semibold text-emerald-300 tracking-wide">Nivel încheiat ✅</p>
            <p className="text-slate-300 mt-1">Scor: <span className="font-bold">{score}</span> · Pereți loviți: <span className="font-bold">{mistakes}</span></p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  const newSeed = Math.floor(Math.random() * 2_147_483_647) + 1;
                  sessionStorage.removeItem(`maze_solo_timer_${mazeSeed}`);
                  sessionStorage.removeItem(`maze_solo_timer_${newSeed}`);
                  setMazeSeed(newSeed);
                  setGameSeconds(null);
                  setFinished(false);
                  setScore(0);
                  setMistakes(0);
                  router.replace(`/labirinturi/play?level=${level}&game=${game}&shape=${shape}&seed=${newSeed}`);
                }}
                className="px-4 py-2 rounded-xl text-white text-xs font-semibold transition-all active:scale-95"
                style={{background:'rgba(16,185,129,0.85)',border:'1px solid rgba(52,211,153,0.4)',boxShadow:'0 4px 12px rgba(16,185,129,0.22),inset 0 1px 0 rgba(255,255,255,0.18)'}}
              >
                Joacă din nou
              </button>
              <Link href="/labirinturi" className="px-4 py-2 rounded-xl text-slate-300 text-xs font-semibold transition-all active:scale-95"
                style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.13)',boxShadow:'0 4px 12px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.12)'}}>
                Alege alt nivel
              </Link>
            </div>
          </div>
        )}

        <MazePlay
          key={mazeSeed}
          started={!finished}
          finished={finished}
          level={level}
          shapeVariant={shape}
          mazeSeed={mazeSeed}
          puzzle={SAMPLE_INTEGRAMA}
          difficultyValue={levelDifficulty}
          onProgress={(correct, wrong) => {
            setScore(correct);
            setMistakes(wrong);
          }}
          onFinish={(correct, wrong) => {
            setScore(correct);
            setMistakes(wrong);
            syncMazeLevelCompletion(level, game, correct, levelGamesCount);
            setFinished(true);
          }}
        />
      </div>
      </>)}
    </div>
  );
}

export default function LabirinturiSoloPlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LabirinturiSoloPlayInner />
    </Suspense>
  );
}
