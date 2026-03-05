'use client';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MazePlay from '@/games/maze/MazePlay';
import GameTimer from '@/components/game/GameTimer';
import { SAMPLE_INTEGRAMA } from '@/lib/puzzles';
import { GAME_RULES } from '@integrame/shared';
import { syncMazeLevelCompletion } from '@/store/mazeSoloProgress';

type MazeShapeVariant = 'rectangle' | 'circle' | 'triangle' | 'hexagon';

const SHAPES: Array<{ id: MazeShapeVariant; label: string; emoji: string }> = [
  { id: 'rectangle', label: 'Dreptunghi', emoji: '▭' },
  { id: 'circle', label: 'Cerc', emoji: '◯' },
  { id: 'triangle', label: 'Triunghi', emoji: '△' },
  { id: 'hexagon', label: 'Hexagon', emoji: '⬡' },
];

function LabirinturiSoloPlayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const level = Math.min(5, Math.max(1, parseInt(searchParams.get('level') || '1', 10)));
  const game = Math.min(3, Math.max(0, parseInt(searchParams.get('game') || '0', 10)));
  const shapeParam = searchParams.get('shape');
  const shape = SHAPES.find((entry) => entry.id === shapeParam)?.id ?? SHAPES[game]?.id ?? 'rectangle';
  const shapeMeta = SHAPES.find((entry) => entry.id === shape) ?? SHAPES[0];

  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);

  const seconds = useMemo(() => GAME_RULES['labirinturi']?.timeLimit ?? 60, []);

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
            {!finished && <GameTimer seconds={seconds} onExpire={() => {
              if (score > 0) {
                syncMazeLevelCompletion(level, game, score);
              }
              setFinished(true);
            }} />}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {finished && (
          <div className="mb-4 rounded-2xl border border-emerald-500/40 bg-emerald-900/20 p-4 text-sm">
            <p className="font-semibold text-emerald-300">Nivel încheiat ✅</p>
            <p className="text-slate-300 mt-1">Scor: <span className="font-bold">{score}</span> · Pereți loviți: <span className="font-bold">{mistakes}</span></p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setFinished(false);
                  setScore(0);
                  setMistakes(0);
                  router.replace(`/labirinturi/play?level=${level}&game=${game}&shape=${shape}`);
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
          started={!finished}
          finished={finished}
          level={level}
          shapeVariant={shape}
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
