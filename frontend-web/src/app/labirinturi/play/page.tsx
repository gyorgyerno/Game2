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
  const didInjectSeed = useRef(false);
  useEffect(() => {
    if (!didInjectSeed.current && !searchParams.get('seed')) {
      didInjectSeed.current = true;
      router.replace(`/labirinturi/play?level=${level}&game=${game}&shape=${shape}&seed=${mazeSeed}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    gamesApi.getRules('labirinturi')
      .then(res => setSeconds(res.data.timeLimit))
      .catch(() => setSeconds(60));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/labirinturi" className="text-slate-400 hover:text-white transition-colors text-sm">
            ← Labirinturi Solo
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Labirinturi · Nivel {level} · Joc {game + 1}</h1>
          <span className="text-sm text-emerald-300 font-semibold">{shapeMeta.emoji} {shapeMeta.label}</span>
          <div className="ml-auto">
            {!finished && seconds !== null && seconds > 0 && (
              <GameTimer key={mazeSeed} seconds={seconds} onExpire={() => {
                if (score > 0) {
                  syncMazeLevelCompletion(level, game, score);
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
          <div className="w-full mb-4 rounded-2xl border border-emerald-500/40 bg-emerald-900/20 p-4 text-sm">
            <p className="font-semibold text-emerald-300">Nivel încheiat ✅</p>
            <p className="text-slate-300 mt-1">Scor: <span className="font-bold">{score}</span> · Pereți loviți: <span className="font-bold">{mistakes}</span></p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  const newSeed = Math.floor(Math.random() * 2_147_483_647) + 1;
                  setMazeSeed(newSeed);
                  setFinished(false);
                  setScore(0);
                  setMistakes(0);
                  router.replace(`/labirinturi/play?level=${level}&game=${game}&shape=${shape}&seed=${newSeed}`);
                }}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                Joacă din nou
              </button>
              <Link href="/labirinturi" className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold">
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
          onProgress={(correct, wrong) => {
            setScore(correct);
            setMistakes(wrong);
          }}
          onFinish={(correct, wrong) => {
            setScore(correct);
            setMistakes(wrong);
            syncMazeLevelCompletion(level, game, correct);
            setFinished(true);
          }}
        />
      </div>
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
