'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GamePlayProps } from '../IGameUI';
import {
  type BallState,
  type InputMap,
  type TrailPoint,
  drawBall,
  resolveCollisions,
  stepPhysics,
  stepPhysicsWithDir,
} from './MazeBallPhysics';

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
  // 0–100: mazeSize 9→17 (odd), 101–200: mazeSize 17→25 (odd)
  const rawSize = diff <= 100
    ? 9 + Math.round((diff / 100) * 8)
    : 17 + Math.round(((diff - 100) / 100) * 8);
  const mazeSize = rawSize % 2 === 0 ? rawSize + 1 : rawSize; // forțăm număr impar
  const bonusCount = diff <= 25 ? 2 : diff <= 75 ? 3 : diff <= 150 ? 4 : 5;
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

  // ─── Refs fizică bilă ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef   = useRef<InputMap>({});
  const ballRef   = useRef<BallState>({ x: 0, y: 0, vx: 0, vy: 0 });
  const trailRef  = useRef<TrailPoint[]>([]);
  const rafRef    = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  // 1.0 = normal, scade la 0.92 la coliziune, revine la 1.0 în ~120ms
  const wallFlashScaleRef  = useRef<number>(1);
  const wallFlashTargetRef = useRef<number>(1);
  // Mouse drag control
  const isDraggingRef   = useRef(false);
  const mouseDirRef     = useRef<{ ax: number; ay: number; power: number } | null>(null);
  const mouseOriginRef  = useRef<{ x: number; y: number } | null>(null); // punct fix = unde s-a dat click

  // Stare internă a bilei pentru logica de joc (celulă curentă, coliziuni cu bonusuri etc.)
  const gameStateRef = useRef({
    player: start,
    wallHits: 0,
    steps: 0,
    collected: 0,
    checkpoint: null as Position | null,
    visited: new Set([keyOf(start)]),
    bonuses: [] as Position[],
    finished: false,
  });

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

    // Reset stare internă fizică
    const startPx = start.col * cellSize + cellSize / 2;
    const startPy = start.row * cellSize + cellSize / 2;
    ballRef.current  = { x: startPx, y: startPy, vx: 0, vy: 0 };
    trailRef.current = [];
    gameStateRef.current = {
      player: start,
      wallHits: 0,
      steps: 0,
      collected: 0,
      checkpoint: null,
      visited: new Set([keyOf(start)]),
      bonuses: nextBonuses,
      finished: false,
    };
  }, [bonusCount, activeCells, start, exit, cellSize]);

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

  // ─── Input: keydown/keyup map ────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const tracked = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'];
      if (tracked.includes(e.key)) {
        e.preventDefault();
        keysRef.current[e.key] = true;
      }
    };
    const onUp = (e: KeyboardEvent) => { keysRef.current[e.key] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // ─── Mouse drag control ──────────────────────────────────────────────────────
  // Virtual joystick: direcția = normalize(mousePos - clickOrigin)
  // Punct de referință FIX (unde s-a dat click), nu bila. Elimină zig-zag-ul.
  const JOYSTICK_MAX_RADIUS = 40; // px de drag = 100% accelerație

  function updateMouseDir(clientX: number, clientY: number) {
    if (!canvasRef.current || !mouseOriginRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const dx = mx - mouseOriginRef.current.x;
    const dy = my - mouseOriginRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Dead zone: trebuie să tragi cel puțin 8px din punctul de click
    if (dist < 8) { mouseDirRef.current = null; return; }
    // power = cât de mult ai tras (0 la dead-zone-edge .. 1 la JOYSTICK_MAX_RADIUS+)
    const power = Math.min(dist / JOYSTICK_MAX_RADIUS, 1);
    mouseDirRef.current = { ax: dx / dist, ay: dy / dist, power };
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      updateMouseDir(e.clientX, e.clientY);
    };
    const onUp = () => {
      isDraggingRef.current = false;
      mouseDirRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Touch: swipe rapid → injectăm direcție în keysRef ──────────────────────
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
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;

    // Injectăm o apăsare scurtă în direcția swipe-ului
    let key: string;
    if (Math.abs(dx) > Math.abs(dy)) key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    else key = dy > 0 ? 'ArrowDown' : 'ArrowUp';

    keysRef.current[key] = true;
    setTimeout(() => { keysRef.current[key] = false; }, 180);
  }

  // ─── Funcție pură de avansare logică în celulă (apelată din rAF) ─────────────
  const advanceCellLogic = useCallback((newCol: number, newRow: number) => {
    const gs = gameStateRef.current;
    if (gs.finished) return;

    const next: Position = { row: newRow, col: newCol };
    const prevKey = keyOf(gs.player);
    const nextKey = keyOf(next);
    if (nextKey === prevKey) return; // încă în aceeași celulă

    const nextVisited = new Set(gs.visited);
    nextVisited.add(nextKey);
    const nextSteps = gs.steps + 1;

    // Colectare bonusuri
    let nextCollected = gs.collected;
    const nextBonuses = gs.bonuses.filter((b) => {
      if (b.row === next.row && b.col === next.col) {
        nextCollected += 1;
        return false;
      }
      return true;
    });

    let nextCheckpoint = gs.checkpoint;
    if (!nextCheckpoint && nextVisited.size >= Math.floor(activeCellCount / 3)) {
      nextCheckpoint = next;
    }

    gs.player    = next;
    gs.steps     = nextSteps;
    gs.collected = nextCollected;
    gs.visited   = nextVisited;
    gs.bonuses   = nextBonuses;
    gs.checkpoint = nextCheckpoint;

    // Actualizare React state (re-render SVG bonusuri + stats)
    setPlayer(next);
    setSteps(nextSteps);
    setCollected(nextCollected);
    setBonuses(nextBonuses);
    setVisited(nextVisited);
    if (nextCheckpoint && nextCheckpoint !== gs.checkpoint) setCheckpoint(nextCheckpoint);

    emitProgress(nextSteps, gs.wallHits, nextCollected, nextVisited);

    // Exit?
    if (next.row === exit.row && next.col === exit.col) {
      gs.finished = true;
      flushProgressNow();
      const finalCorrect = Math.max(1, nextSteps + nextCollected * 6);
      const finalMistakes = shouldPenalizeWalls ? gs.wallHits : 0;
      onFinish(finalCorrect, finalMistakes, {
        steps: nextSteps,
        wallHits: gs.wallHits,
        bonusesCollected: nextCollected,
        usedCheckpoint: !!nextCheckpoint,
      });
    }
  }, [activeCellCount, emitProgress, exit.col, exit.row, onFinish, shouldPenalizeWalls]);

  // ─── rAF loop ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || finished) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    // Inițializăm bila la poziția de start (în px)
    if (ballRef.current.x === 0 && ballRef.current.y === 0) {
      ballRef.current = {
        x: start.col * cellSize + cellSize / 2,
        y: start.row * cellSize + cellSize / 2,
        vx: 0,
        vy: 0,
      };
    }

    const ballRadius = cellSize / 3;

    function loop(now: number) {
      if (!canvasRef.current) { rafRef.current = requestAnimationFrame(loop); return; }
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      // 1. Fizică — mouse drag are prioritate față de taste
      const next = mouseDirRef.current
        ? stepPhysicsWithDir(ballRef.current, mouseDirRef.current.ax, mouseDirRef.current.ay, dt, mouseDirRef.current.power)
        : stepPhysics(ballRef.current, keysRef.current, dt);

      // 2. Coliziune cu pereții
      const { state, hitWall } = resolveCollisions(next, cellSize, maze, activeMap, ballRadius);
      ballRef.current = state;

      // 3. Wall hit → flash + bump scale
      if (hitWall) {
        const gs = gameStateRef.current;
        gs.wallHits += 1;
        setWallHits(gs.wallHits);
        setWallFlash(true);
        wallFlashScaleRef.current  = 0.92;
        wallFlashTargetRef.current = 1.0;
        setTimeout(() => setWallFlash(false), 160);
        emitProgress(gs.steps, gs.wallHits, gs.collected, gs.visited);
      }

      // Animație scale bilă după coliziune (ease back to 1)
      if (wallFlashScaleRef.current < wallFlashTargetRef.current) {
        wallFlashScaleRef.current = Math.min(1, wallFlashScaleRef.current + dt * 8);
      }

      // 4. Detectare celulă nouă pentru logica de joc
      const newCol = Math.floor(state.x / cellSize);
      const newRow = Math.floor(state.y / cellSize);
      if (
        newRow >= 0 && newRow < mazeSize &&
        newCol >= 0 && newCol < mazeSize &&
        activeMap[newRow]?.[newCol]
      ) {
        advanceCellLogic(newCol, newRow);
      }

      // 5. Desenare canvas
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, mazeSize * cellSize, mazeSize * cellSize);
        drawBall(
          ctx,
          ballRef.current,
          cellSize,
          trailRef.current,
          wallFlashScaleRef.current < 0.99,
          wallFlashScaleRef.current,
        );
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, maze, activeMap, mazeSize, cellSize, advanceCellLogic, emitProgress]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, []);

  // isNeighborCell păstrăm pentru drag-mouse pe SVG (bazat pe player din React state)
  function isNeighborCell(target: Position): Direction | null {
    if (target.row === player.row - 1 && target.col === player.col) return 'up';
    if (target.row === player.row + 1 && target.col === player.col) return 'down';
    if (target.row === player.row && target.col === player.col - 1) return 'left';
    if (target.row === player.row && target.col === player.col + 1) return 'right';
    return null;
  }

  // Injecție direcție din click pe celulă vecinăă (compatibilitate drag mouse)
  function injectDirection(dir: Direction) {
    keysRef.current[dir === 'up' ? 'ArrowUp' : dir === 'down' ? 'ArrowDown' : dir === 'left' ? 'ArrowLeft' : 'ArrowRight'] = true;
    setTimeout(() => {
      keysRef.current['ArrowUp'] = keysRef.current['ArrowDown'] = keysRef.current['ArrowLeft'] = keysRef.current['ArrowRight'] = false;
    }, 80);
  }

  return (
    <div className="flex flex-col items-center gap-6 px-4 pb-24 w-full max-w-5xl">
      {/* Stat cards — Liquid Glass iOS 26 */}
      <div className="w-full max-w-3xl grid grid-cols-4 gap-2 text-sm">
        <div className="rounded-2xl px-3 py-2.5 flex items-center gap-1.5 backdrop-blur-md"
          style={{background:'rgba(16,185,129,0.07)',border:'1px solid rgba(52,211,153,0.18)',boxShadow:'0 4px 16px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.10)'}}>
          <span>👣</span><span className="text-slate-400 font-normal text-sm">Pași</span>
          <span className="ml-auto tabular-nums font-bold text-emerald-300">{steps}</span>
        </div>
        <div className="rounded-2xl px-3 py-2.5 flex items-center gap-1.5 backdrop-blur-md"
          style={{background:'rgba(245,158,11,0.07)',border:'1px solid rgba(251,191,36,0.18)',boxShadow:'0 4px 16px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.10)'}}>
          <span>⭐</span><span className="text-slate-400 font-normal text-sm">Bonus</span>
          <span className="ml-auto tabular-nums font-bold text-amber-300">{collected}</span>
        </div>
        <div className="rounded-2xl px-3 py-2.5 flex flex-col gap-0.5 backdrop-blur-md"
          style={{background: shouldPenalizeWalls ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.07)',border: shouldPenalizeWalls ? '1px solid rgba(252,165,165,0.28)' : '1px solid rgba(252,165,165,0.18)',boxShadow:'0 4px 16px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.10)'}}>
          <div className="flex items-center gap-1.5">
            <span>🧱</span><span className="text-slate-400 font-normal text-sm">Pereți</span>
            <span className="ml-auto tabular-nums font-bold text-rose-300">{wallHits}</span>
          </div>
          <span className="text-[10px] leading-tight" style={{color: shouldPenalizeWalls ? 'rgba(252,165,165,0.7)' : 'rgba(134,239,172,0.6)'}}>
            {shouldPenalizeWalls ? '−scor' : 'fără penalizare'}
          </span>
        </div>
        <div className="rounded-2xl px-3 py-2.5 flex items-center gap-1.5 backdrop-blur-md"
          style={{background:'rgba(139,92,246,0.07)',border:'1px solid rgba(167,139,250,0.18)',boxShadow:'0 4px 16px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.10)'}}>
          <span>🎯</span><span className="text-slate-400 font-normal text-sm">Nivel</span>
          <span className="ml-auto tabular-nums font-bold text-violet-300">{level}</span>
        </div>
      </div>

      <div
        className="relative w-fit rounded-[32px] select-none touch-none"
        style={{
          padding: '28px',
          background: 'linear-gradient(135deg,#0c1a2e 0%,#0a2020 100%)',
          border: '1.5px solid rgba(34,211,238,0.18)',
          boxShadow: '0 0 72px rgba(6,182,212,0.14),0 24px 64px rgba(0,0,0,0.65),inset 0 1px 0 rgba(34,211,238,0.14)',
          backdropFilter: 'blur(2px)',
          cursor: started && !finished ? 'crosshair' : 'default',
        }}
        onMouseDown={(e) => {
          if (!started || finished) return;
          e.preventDefault();
          isDraggingRef.current = true;
          // Salvăm originea în coordonate canvas
          if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            mouseOriginRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          }
          updateMouseDir(e.clientX, e.clientY);
        }}
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
              .maze-exit-pulse { animation: maze-exit-pulse 1.4s ease-in-out infinite; }
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
                    if (dir) injectDirection(dir);
                  }}
                  onMouseEnter={(e) => {
                    if ((e.buttons & 1) !== 1) return;
                    const dir = isNeighborCell({ row: rowIndex, col: colIndex });
                    if (dir) injectDirection(dir);
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

          {/* Bila este desenată pe canvas overlay — nu mai e în SVG */}
        </svg>

        {/* Canvas overlay — bila + trail + effects la 60fps */}
        <canvas
          ref={canvasRef}
          width={mazeSize * cellSize}
          height={mazeSize * cellSize}
          style={{
            position: 'absolute',
            top: '28px',
            left: '28px',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div className="text-center text-xs tracking-wide mb-2" style={{color:'rgba(34,211,238,0.5)',letterSpacing:'0.03em'}}>
        {started && !finished
          ? 'Controlează bila cu săgeți, swipe sau drag între celule vecine.'
          : 'Așteaptă startul meciului pentru a începe.'}
      </div>
      <div className="grid grid-cols-3 gap-2 w-[220px] p-3 rounded-[28px]"
        style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.09)',boxShadow:'0 8px 32px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.08)',backdropFilter:'blur(12px)'}}>
        <div />
        <button
          onClick={() => injectDirection('up')}
          disabled={!started || finished}
          className="rounded-2xl px-3 py-2.5 text-base font-bold text-cyan-300 disabled:opacity-25 transition-all duration-75 active:scale-90 select-none"
          style={{background:'rgba(34,211,238,0.08)',border:'1px solid rgba(34,211,238,0.2)',boxShadow:'0 4px 12px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.15)'}}
        >
          ↑
        </button>
        <div />
        <button
          onClick={() => injectDirection('left')}
          disabled={!started || finished}
          className="rounded-2xl px-3 py-2.5 text-base font-bold text-cyan-300 disabled:opacity-25 transition-all duration-75 active:scale-90 select-none"
          style={{background:'rgba(34,211,238,0.08)',border:'1px solid rgba(34,211,238,0.2)',boxShadow:'0 4px 12px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.15)'}}
        >
          ←
        </button>
        <div className="rounded-2xl px-3 py-2 flex items-center justify-center"
          style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',color:'rgba(148,163,184,0.35)',fontSize:18}}>
          ⊕
        </div>
        <button
          onClick={() => injectDirection('right')}
          disabled={!started || finished}
          className="rounded-2xl px-3 py-2.5 text-base font-bold text-cyan-300 disabled:opacity-25 transition-all duration-75 active:scale-90 select-none"
          style={{background:'rgba(34,211,238,0.08)',border:'1px solid rgba(34,211,238,0.2)',boxShadow:'0 4px 12px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.15)'}}
        >
          →
        </button>
        <div />
        <button
          onClick={() => injectDirection('down')}
          disabled={!started || finished}
          className="rounded-2xl px-3 py-2.5 text-base font-bold text-cyan-300 disabled:opacity-25 transition-all duration-75 active:scale-90 select-none"
          style={{background:'rgba(34,211,238,0.08)',border:'1px solid rgba(34,211,238,0.2)',boxShadow:'0 4px 12px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.15)'}}
        >
          ↓
        </button>
        <div />
      </div>
    </div>
  );
}
