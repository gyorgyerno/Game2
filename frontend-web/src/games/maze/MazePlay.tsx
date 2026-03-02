'use client';
import type { GamePlayProps } from '../IGameUI';

/**
 * MazePlay — placeholder pentru jocul de labirint.
 * Înlocuiește cu logica reală când jocul e implementat.
 */
export default function MazePlay({ started, finished, onFinish }: GamePlayProps) {
  return (
    <div className="flex flex-col items-center gap-8 px-6 pb-32 w-full max-w-2xl">
      <div className="w-full aspect-square max-w-md bg-emerald-50 border-2 border-emerald-200 rounded-3xl flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🌿</div>
          <h2 className="text-2xl font-bold text-emerald-700">Maze Game</h2>
          <p className="text-emerald-500 text-sm mt-2">Coming soon...</p>

          {started && !finished && (
            <button
              onClick={() => onFinish(1, 0)}
              className="mt-6 px-6 py-3 bg-emerald-600 text-white rounded-full font-semibold hover:bg-emerald-700 transition-colors"
            >
              Finalizează (test)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
