'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GamePlayProps } from '../IGameUI';

type Direction = 'up' | 'down' | 'left' | 'right';

type MazeCell = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

type Position = { row: number; col: number };
type MazeShapeVariant = 'rectangle' | 'circle' | 'triangle' | 'hexagon' | 'diamond' | 'cross' | 'octagon' | 'ellipse' | 'arch' | 'arrow';

interface MazePlayProps extends GamePlayProps {
  shapeVariant?: MazeShapeVariant;
  /** 0-100: dificultatea nivelului din admin. Folosit pentru a calcula mazeSize, bonusuri, penalizări. */
  difficultyValue?: number;
}

/** LCG deterministă (Numerical Recipes). Returnează float în [0, 1). */
function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  // Avansăm seedul de câteva ori pentru a evita valorile mici la start
  s = (Math.imul(1664525, s) + 1013904223) >>> 0;
  s = (Math.imul(1664525, s) + 1013904223) >>> 0;
  return function lcgRand(): number {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function keyOf(pos: Position): string {
  return `${pos.row}:${pos.col}`;
}

function isCellInShape(row: number, col: number, size: number, shape: MazeShapeVariant): boolean {
  if (shape === 'rectangle') return true;

  const center = (size - 1) / 2;
  const x = col - center;
  const y = row - center;
  const radius = Math.max(2, size * 0.48);

  if (shape === 'circle') {
    return Math.sqrt(x * x + y * y) <= radius;
  }

  if (shape === 'triangle') {
    const topPadding = Math.floor(size * 0.06);
    const adjustedRow = row - topPadding;
    const height = size - topPadding;
    if (adjustedRow < 0 || adjustedRow >= height) return false;
    const widthFactor = adjustedRow / Math.max(1, height - 1);
    const halfSpan = widthFactor * (size / 2 - 1);
    return Math.abs(col - center) <= halfSpan;
  }

  if (shape === 'hexagon') {
    const q = Math.abs(x) / radius;
    const r = Math.abs(y) / radius;
    return q + r * 0.68 <= 1;
  }

  // Romb (pătrat rotit 45°)
  if (shape === 'diamond') {
    return Math.abs(x) + Math.abs(y) <= radius * 0.97;
  }

  // Cruce / Plus
  if (shape === 'cross') {
    return Math.abs(x) <= radius * 0.35 || Math.abs(y) <= radius * 0.35;
  }

  // Octogon
  if (shape === 'octagon') {
    return Math.abs(x) <= radius * 0.93 && Math.abs(y) <= radius * 0.93 && Math.abs(x) + Math.abs(y) <= radius * 1.32;
  }

  // Elipsă orizontală
  if (shape === 'ellipse') {
    const bx = radius * 1.2;
    const by = radius * 0.72;
    return (x * x) / (bx * bx) + (y * y) / (by * by) <= 1;
  }

  // Arc (semicercul de sus + dreptunghi de jos)
  if (shape === 'arch') {
    const r2 = radius * 0.93;
    return y >= 0 ? Math.abs(x) <= r2 : Math.sqrt(x * x + y * y) <= r2;
  }

  // Săgeată (vârf sus, coadă jos)
  if (shape === 'arrow') {
    const shoulder = -radius * 0.2;
    if (y <= shoulder) {
      const progress = (y - (-radius)) / (shoulder - (-radius));
      return Math.abs(x) <= radius * progress;
    }
    return Math.abs(x) <= radius * 0.38 && y <= radius * 0.98;
  }

  return true; // fallback rectangle
}

function getActiveCells(size: number, shape: MazeShapeVariant): Position[] {
  const cells: Position[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isCellInShape(row, col, size, shape)) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

function buildMaze(size: number, activeMap: boolean[][], start: Position, rand: () => number): MazeCell[][] {
  const maze: MazeCell[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ top: true, right: true, bottom: true, left: true }))
  );

  const visited: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => true));
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      visited[row][col] = !activeMap[row][col];
    }
  }

  const stack: Position[] = [start];
  visited[start.row][start.col] = true;

  const dirs: Array<{ dir: Direction; dr: number; dc: number }> = [
    { dir: 'up', dr: -1, dc: 0 },
    { dir: 'right', dr: 0, dc: 1 },
    { dir: 'down', dr: 1, dc: 0 },
    { dir: 'left', dr: 0, dc: -1 },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = dirs
      .map((d) => ({ ...d, nr: current.row + d.dr, nc: current.col + d.dc }))
      .filter((d) => d.nr >= 0 && d.nr < size && d.nc >= 0 && d.nc < size && activeMap[d.nr][d.nc] && !visited[d.nr][d.nc]);

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const next = candidates[Math.floor(rand() * candidates.length)];
    const from = maze[current.row][current.col];
    const to = maze[next.nr][next.nc];

    if (next.dir === 'up') {
      from.top = false;
      to.bottom = false;
    } else if (next.dir === 'right') {
      from.right = false;
      to.left = false;
    } else if (next.dir === 'down') {
      from.bottom = false;
      to.top = false;
    } else {
      from.left = false;
      to.right = false;
    }

    visited[next.nr][next.nc] = true;
    stack.push({ row: next.nr, col: next.nc });
  }

  return maze;
}

function cellCenter(cellSize: number, pos: Position) {
  return {
    x: pos.col * cellSize + cellSize / 2,
    y: pos.row * cellSize + cellSize / 2,
  };
}

function starPath(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export default function MazePlay({ started, finished, level = 1, onProgress, onFinish, shapeVariant = 'rectangle', mazeSeed, difficultyValue }: MazePlayProps) {
  // Dacă difficultyValue e furnizat din admin, derivăm parametrii din el (0=ușor, 100=greu)
  // Altfel fallback la formula bazată pe nivel (backward-compatible)
  const diff = difficultyValue ?? Math.min(100, (level - 1) * 25);
  const rawSize = 9 + Math.round((diff / 100) * 8);
  const mazeSize = rawSize % 2 === 0 ? rawSize + 1 : rawSize; // forțăm număr impar
  const bonusCount = diff <= 25 ? 2 : diff <= 75 ? 3 : 4;
  const shouldPenalizeWalls = diff >= 75;
  const cellSize = 32;

  const activeCells = useMemo(() => getActiveCells(mazeSize, shapeVariant), [mazeSize, shapeVariant]);
  const activeMap = useMemo(() => {
    const map = Array.from({ length: mazeSize }, () => Array.from({ length: mazeSize }, () => false));
    for (const cell of activeCells) {
      map[cell.row][cell.col] = true;
    }
    return map;
  }, [activeCells, mazeSize]);

  const start: Position = activeCells[0] ?? { row: 0, col: 0 };
  const exit: Position = activeCells[activeCells.length - 1] ?? { row: mazeSize - 1, col: mazeSize - 1 };
  // rand() seeded dacă mazeSeed e prezent → ambii jucători generează același labirint
  // rand() neseeded (Math.random) pentru solo/preview
  const mazeRand = useMemo(() => (
    mazeSeed !== undefined ? makeLCG(mazeSeed) : () => Math.random()
  ), [mazeSeed, mazeSize, shapeVariant]);
  const maze = useMemo(() => buildMaze(mazeSize, activeMap, start, mazeRand), [mazeSize, activeMap, start, mazeRand]);
  const activeCellCount = activeCells.length || 1;

  const [player, setPlayer] = useState<Position>(() => start);
  const [wallHits, setWallHits] = useState(0);
  const [steps, setSteps] = useState(0);
  const [wallFlash, setWallFlash] = useState(false);
  const [checkpoint, setCheckpoint] = useState<Position | null>(null);
  const [visited, setVisited] = useState<Set<string>>(() => new Set([keyOf(start)]));
  const [bonuses, setBonuses] = useState<Position[]>([]);
  const [collected, setCollected] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<{ correct: number; mistakes: number; metrics: Record<string, unknown> } | null>(null);

  const FLUSH_PROGRESS_MS = 120;

  useEffect(() => {
    const bonusRand = mazeSeed !== undefined ? makeLCG(mazeSeed + 1) : () => Math.random();
    const occupied = new Set<string>([keyOf(start), keyOf(exit)]);
    const nextBonuses: Position[] = [];
    while (nextBonuses.length < bonusCount) {
      const pos = activeCells[Math.floor(bonusRand() * activeCells.length)] ?? start;
      const id = keyOf(pos);
      if (occupied.has(id)) continue;
      occupied.add(id);
      nextBonuses.push(pos);
    }
    setBonuses(nextBonuses);
    setCollected(0);
    setPlayer(start);
    setSteps(0);
    setWallHits(0);
    setCheckpoint(null);
    setVisited(new Set([keyOf(start)]));
  }, [bonusCount, activeCells, start, exit]);

  const emitProgress = useCallback((nextSteps: number, nextWallHits: number, nextCollected: number, nextVisited: Set<string>) => {
    const progressPoints = Math.max(1, nextSteps + nextCollected * 4);
    const mistakes = shouldPenalizeWalls ? nextWallHits : 0;
    const progressPercent = Math.min(100, Math.round((nextVisited.size / activeCellCount) * 100));

    pendingProgressRef.current = {
      correct: progressPoints,
      mistakes,
      metrics: {
      steps: nextSteps,
      wallHits: nextWallHits,
      bonusesCollected: nextCollected,
      progressPercent,
      },
    };

    if (progressTimerRef.current) return;

    progressTimerRef.current = setTimeout(() => {
      const pending = pendingProgressRef.current;
      progressTimerRef.current = null;
      if (!pending) return;
      onProgress(pending.correct, pending.mistakes, pending.metrics);
    }, FLUSH_PROGRESS_MS);
  }, [activeCellCount, onProgress, shouldPenalizeWalls]);

  function flushProgressNow() {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    const pending = pendingProgressRef.current;
    if (!pending) return;
    onProgress(pending.correct, pending.mistakes, pending.metrics);
  }

  const getNextPos = useCallback((from: Position, dir: Direction): Position => {
    if (dir === 'up') return { row: from.row - 1, col: from.col };
    if (dir === 'right') return { row: from.row, col: from.col + 1 };
    if (dir === 'down') return { row: from.row + 1, col: from.col };
    return { row: from.row, col: from.col - 1 };
  }, []);

  const canMove = useCallback((from: Position, dir: Direction): boolean => {
    const cell = maze[from.row][from.col];
    const nextPos = getNextPos(from, dir);
    if (!activeMap[nextPos.row]?.[nextPos.col]) return false;
    if (dir === 'up') return !cell.top;
    if (dir === 'right') return !cell.right;
    if (dir === 'down') return !cell.bottom;
    return !cell.left;
  }, [activeMap, maze, getNextPos]);

  const move = useCallback((dir: Direction) => {
    if (!started || finished) return;

    if (!canMove(player, dir)) {
      const nextWallHits = wallHits + 1;
      setWallHits(nextWallHits);
      setWallFlash(true);
      setTimeout(() => setWallFlash(false), 160);
      emitProgress(steps, nextWallHits, collected, visited);
      return;
    }

    const next = getNextPos(player, dir);
    const nextSteps = steps + 1;
    const nextVisited = new Set(visited);
    nextVisited.add(keyOf(next));

    let nextCollected = collected;
    const nextBonuses = bonuses.filter((b) => {
      const isHit = b.row === next.row && b.col === next.col;
      if (isHit) nextCollected += 1;
      return !isHit;
    });

    setBonuses(nextBonuses);
    setPlayer(next);
    setSteps(nextSteps);
    setVisited(nextVisited);

    if (!checkpoint && nextVisited.size >= Math.floor(activeCellCount / 3)) {
      setCheckpoint(next);
    }

    emitProgress(nextSteps, wallHits, nextCollected, nextVisited);
    setCollected(nextCollected);

    if (next.row === exit.row && next.col === exit.col) {
      flushProgressNow();
      const finalCorrect = Math.max(1, nextSteps + nextCollected * 6);
      const finalMistakes = shouldPenalizeWalls ? wallHits : 0;
      onFinish(finalCorrect, finalMistakes, {
        steps: nextSteps,
        wallHits,
        bonusesCollected: nextCollected,
        usedCheckpoint: !!checkpoint,
      });
    }
  }, [
    started,
    finished,
    canMove,
    player,
    wallHits,
    steps,
    collected,
    visited,
    checkpoint,
    mazeSize,
    activeCellCount,
    exit.row,
    exit.col,
    shouldPenalizeWalls,
    bonuses,
    emitProgress,
    getNextPos,
    onFinish,
  ]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowUp') move('up');
      if (e.key === 'ArrowRight') move('right');
      if (e.key === 'ArrowDown') move('down');
      if (e.key === 'ArrowLeft') move('left');
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const startPoint = touchStartRef.current;
    if (!startPoint) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - startPoint.x;
    const dy = touch.clientY - startPoint.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) < 16) return;
    if (absX > absY) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }

  function isNeighborCell(target: Position): Direction | null {
    if (target.row === player.row - 1 && target.col === player.col) return 'up';
    if (target.row === player.row + 1 && target.col === player.col) return 'down';
    if (target.row === player.row && target.col === player.col - 1) return 'left';
    if (target.row === player.row && target.col === player.col + 1) return 'right';
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-6 px-4 pb-24 w-full max-w-5xl">
      {/* Stat cards — dark gaming */}
      <div className="w-full max-w-3xl grid grid-cols-4 gap-2 text-sm">
        <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-emerald-400 font-semibold">👣 Pași: {steps}</div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-amber-400 font-semibold">⭐ Bonusuri: {collected}</div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-rose-400 font-semibold">🧱 Pereți: {wallHits}</div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-violet-400 font-semibold">🎯 Nivel: {level}</div>
      </div>

      <div
        className="relative w-fit bg-slate-950 border-2 border-cyan-900/50 rounded-3xl p-4 select-none touch-none shadow-[0_0_48px_rgba(6,182,212,0.18)]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <svg
          width={mazeSize * cellSize}
          height={mazeSize * cellSize}
          className="rounded-2xl block"
          style={{ background: 'linear-gradient(135deg,#0c1a2e 0%,#0a2020 100%)', margin: '0 auto' }}
        >
          <defs>
            <filter id="glow-player" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-exit" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-bonus" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-ckpt" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <style>{`
              @keyframes maze-exit-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
              @keyframes maze-aura-pulse { 0%,100%{opacity:0.3} 50%{opacity:0.08} }
              .maze-exit-pulse { animation: maze-exit-pulse 1.4s ease-in-out infinite; }
              .maze-aura-pulse { animation: maze-aura-pulse 1s ease-in-out infinite; }
            `}</style>
          </defs>

          {/* Visited cell trail */}
          {maze.map((row, rowIndex) =>
            row.map((_, colIndex) => {
              if (!activeMap[rowIndex][colIndex]) return null;
              if (!visited.has(keyOf({ row: rowIndex, col: colIndex }))) return null;
              return (
                <rect
                  key={`tr-${rowIndex}-${colIndex}`}
                  x={colIndex * cellSize} y={rowIndex * cellSize}
                  width={cellSize} height={cellSize}
                  fill="rgba(34,211,238,0.07)"
                />
              );
            })
          )}

          {/* Walls */}
          {maze.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              if (!activeMap[rowIndex][colIndex]) return null;
              const x = colIndex * cellSize;
              const y = rowIndex * cellSize;
              return (
                <g
                  key={`${rowIndex}-${colIndex}`}
                  onMouseDown={() => {
                    const dir = isNeighborCell({ row: rowIndex, col: colIndex });
                    if (dir) move(dir);
                  }}
                  onMouseEnter={(e) => {
                    if ((e.buttons & 1) !== 1) return;
                    const dir = isNeighborCell({ row: rowIndex, col: colIndex });
                    if (dir) move(dir);
                  }}
                >
                  {cell.top    && <line x1={x}           y1={y}           x2={x + cellSize} y2={y}           stroke="#22d3ee" strokeWidth="2" />}
                  {cell.right  && <line x1={x + cellSize} y1={y}           x2={x + cellSize} y2={y + cellSize} stroke="#22d3ee" strokeWidth="2" />}
                  {cell.bottom && <line x1={x}           y1={y + cellSize} x2={x + cellSize} y2={y + cellSize} stroke="#22d3ee" strokeWidth="2" />}
                  {cell.left   && <line x1={x}           y1={y}           x2={x}            y2={y + cellSize} stroke="#22d3ee" strokeWidth="2" />}
                </g>
              );
            })
          )}

          {/* Exit — pulsing neon green */}
          <g className="maze-exit-pulse" filter="url(#glow-exit)">
            <rect
              x={exit.col * cellSize + 3} y={exit.row * cellSize + 3}
              width={cellSize - 6} height={cellSize - 6}
              rx={5} fill="#052e16" stroke="#4ade80" strokeWidth={2}
            />
            <line x1={exit.col * cellSize + 7}          y1={exit.row * cellSize + cellSize / 2}
                  x2={exit.col * cellSize + cellSize - 7} y2={exit.row * cellSize + cellSize / 2}
                  stroke="#4ade80" strokeWidth={1.5} />
            <line x1={exit.col * cellSize + cellSize / 2} y1={exit.row * cellSize + 7}
                  x2={exit.col * cellSize + cellSize / 2} y2={exit.row * cellSize + cellSize - 7}
                  stroke="#4ade80" strokeWidth={1.5} />
          </g>

          {/* Checkpoint */}
          {checkpoint && (
            <rect
              x={checkpoint.col * cellSize + 5} y={checkpoint.row * cellSize + 5}
              width={cellSize - 10} height={cellSize - 10}
              rx={4} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={2}
              filter="url(#glow-ckpt)"
            />
          )}

          {/* Bonuses — gold stars */}
          {bonuses.map((bonus) => {
            const { x: cx, y: cy } = cellCenter(cellSize, bonus);
            return (
              <path
                key={keyOf(bonus)}
                d={starPath(cx, cy, 8, 3.5)}
                fill="#fbbf24" stroke="#f59e0b" strokeWidth={0.5}
                filter="url(#glow-bonus)"
              />
            );
          })}

          {/* Player — aura ring + glowing core */}
          <circle
            cx={cellCenter(cellSize, player).x}
            cy={cellCenter(cellSize, player).y}
            r={cellSize / 3 + 5}
            fill={wallFlash ? '#f43f5e' : '#3b82f6'}
            className="maze-aura-pulse"
          />
          <circle
            cx={cellCenter(cellSize, player).x}
            cy={cellCenter(cellSize, player).y}
            r={cellSize / 3}
            fill={wallFlash ? '#f43f5e' : '#60a5fa'}
            filter="url(#glow-player)"
          />
        </svg>

        <div className="mt-3 text-center text-sm text-cyan-400/80 font-medium">
          {started && !finished
            ? 'Controlează bila cu săgeți, swipe sau drag între celule vecine.'
            : 'Așteaptă startul meciului pentru a începe.'}
        </div>
      </div>

      <div className="text-xs text-slate-500 text-center max-w-xl">
        {shouldPenalizeWalls
          ? 'Nivel dificil: lovirea pereților scade scorul.'
          : 'Nivel accesibil: lovirea pereților nu scade scorul.'}
      </div>

      <div className="grid grid-cols-3 gap-2 w-[220px]">
        <div />
        <button
          onClick={() => move('up')}
          disabled={!started || finished}
          className="rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm font-semibold text-cyan-300 disabled:opacity-30 transition-colors"
        >
          ↑
        </button>
        <div />
        <button
          onClick={() => move('left')}
          disabled={!started || finished}
          className="rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm font-semibold text-cyan-300 disabled:opacity-30 transition-colors"
        >
          ←
        </button>
        <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-500 text-center">
          ●
        </div>
        <button
          onClick={() => move('right')}
          disabled={!started || finished}
          className="rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm font-semibold text-cyan-300 disabled:opacity-30 transition-colors"
        >
          →
        </button>
        <div />
        <button
          onClick={() => move('down')}
          disabled={!started || finished}
          className="rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-sm font-semibold text-cyan-300 disabled:opacity-30 transition-colors"
        >
          ↓
        </button>
        <div />
      </div>
    </div>
  );
}
