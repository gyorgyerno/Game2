/**
 * MazeBallPhysics
 * ───────────────
 * Modul de fizică pentru bila din labirint — 2026 iOS-quality feel.
 * Velocity-based, frame-independent (deltaTime), complet separat de logica de joc.
 */

export type MazeCell = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

export interface BallState {
  x: number; // px (centrul bilei)
  y: number;
  vx: number; // px/s
  vy: number;
}

export type InputMap = { [key: string]: boolean };

export type SoundEvent = 'move' | 'wall_hit';

export const PHYSICS = {
  maxSpeed: 160,       // px/s
  acceleration: 800,   // px/s²
  friction: 0.88,      // factor aplicat per frame (0..1)
  bounceFactor: 0.22,  // ce fracție din viteză rămâne după coliziune
  stopThreshold: 1.5,  // px/s sub care bila se oprește complet (evită drift infinit)
} as const;

// ─── Fizică ────────────────────────────────────────────────────────────────────

/**
 * Calculează starea nouă a bilei pentru un frame.
 * dt: deltaTime în secunde (capped extern la 0.05 pentru stabilitate)
 */
export function stepPhysics(state: BallState, input: InputMap, dt: number): BallState {
  let { x, y, vx, vy } = state;

  // Direcție din taste
  let ax = 0;
  let ay = 0;
  if (input['ArrowLeft']  || input['a'] || input['A']) ax -= 1;
  if (input['ArrowRight'] || input['d'] || input['D']) ax += 1;
  if (input['ArrowUp']    || input['w'] || input['W']) ay -= 1;
  if (input['ArrowDown']  || input['s'] || input['S']) ay += 1;

  // Normalizare diagonală (evită viteză mai mare pe diagonală)
  const len = Math.sqrt(ax * ax + ay * ay);
  if (len > 0) {
    ax /= len;
    ay /= len;
  }

  // Accelerare
  vx += ax * PHYSICS.acceleration * dt;
  vy += ay * PHYSICS.acceleration * dt;

  // Friction pe axele fără input (deceleration naturală)
  if (ax === 0) vx *= Math.pow(PHYSICS.friction, dt * 60);
  if (ay === 0) vy *= Math.pow(PHYSICS.friction, dt * 60);

  // Clamp la maxSpeed
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > PHYSICS.maxSpeed) {
    const scale = PHYSICS.maxSpeed / speed;
    vx *= scale;
    vy *= scale;
  }

  // Stop complet sub threshold (elimină drift)
  if (Math.abs(vx) < PHYSICS.stopThreshold) vx = 0;
  if (Math.abs(vy) < PHYSICS.stopThreshold) vy = 0;

  x += vx * dt;
  y += vy * dt;

  return { x, y, vx, vy };
}

/**
 * Versiune cu direcție directă (ax, ay) — pentru input analog (mouse, gamepad).
 * ax/ay: valori normalizate [-1..1]
 * power: scalar 0..1 (câtă accelerație) — pentru joystick analog
 */
export function stepPhysicsWithDir(state: BallState, ax: number, ay: number, dt: number, power = 1): BallState {
  let { x, y, vx, vy } = state;

  const len = Math.sqrt(ax * ax + ay * ay);
  const nx = len > 0 ? ax / len : 0;
  const ny = len > 0 ? ay / len : 0;
  const accel = PHYSICS.acceleration * Math.min(power, 1);

  vx += nx * accel * dt;
  vy += ny * accel * dt;

  if (nx === 0) vx *= Math.pow(PHYSICS.friction, dt * 60);
  if (ny === 0) vy *= Math.pow(PHYSICS.friction, dt * 60);

  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > PHYSICS.maxSpeed) {
    vx = (vx / speed) * PHYSICS.maxSpeed;
    vy = (vy / speed) * PHYSICS.maxSpeed;
  }

  if (Math.abs(vx) < PHYSICS.stopThreshold) vx = 0;
  if (Math.abs(vy) < PHYSICS.stopThreshold) vy = 0;

  x += vx * dt;
  y += vy * dt;

  return { x, y, vx, vy };
}

// ─── Coliziune per-axă (fără stutter / stuck) ──────────────────────────────────

/**
 * Rezolvă coliziunile cu pereții labirintului.
 * Tratează X și Y separat pentru a evita stutter la colțuri.
 * Returnează starea corectată și dacă s-a produs o lovitură de perete.
 */
export function resolveCollisions(
  next: BallState,
  cellSize: number,
  maze: MazeCell[][],
  activeMap: boolean[][],
  ballRadius: number,
): { state: BallState; hitWall: boolean } {
  let { x, y, vx, vy } = next;
  let hitWall = false;

  const rows = maze.length;
  const cols = maze[0]?.length ?? 0;

  // Clampăm poziția în bounds absolute
  x = Math.max(ballRadius, Math.min(cols * cellSize - ballRadius, x));
  y = Math.max(ballRadius, Math.min(rows * cellSize - ballRadius, y));

  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);

  if (row < 0 || row >= rows || col < 0 || col >= cols) {
    return { state: { x, y, vx, vy }, hitWall: false };
  }

  const cell = maze[row][col];
  if (!cell) return { state: { x, y, vx, vy }, hitWall: false };

  // Marginile interioare ale celulei (cu padding de ballRadius)
  const wallLeft   = col * cellSize + ballRadius;
  const wallRight  = (col + 1) * cellSize - ballRadius;
  const wallTop    = row * cellSize + ballRadius;
  const wallBottom = (row + 1) * cellSize - ballRadius;

  // ─ Axă X ─
  if (cell.left && x < wallLeft) {
    x = wallLeft;
    vx = Math.abs(vx) * PHYSICS.bounceFactor;
    hitWall = true;
  } else if (cell.right && x > wallRight) {
    x = wallRight;
    vx = -Math.abs(vx) * PHYSICS.bounceFactor;
    hitWall = true;
  }

  // ─ Axă Y ─
  if (cell.top && y < wallTop) {
    y = wallTop;
    vy = Math.abs(vy) * PHYSICS.bounceFactor;
    hitWall = true;
  } else if (cell.bottom && y > wallBottom) {
    y = wallBottom;
    vy = -Math.abs(vy) * PHYSICS.bounceFactor;
    hitWall = true;
  }

  return { state: { x, y, vx, vy }, hitWall };
}

// ─── Renderer Canvas ────────────────────────────────────────────────────────────

export interface TrailPoint { x: number; y: number }

const TRAIL_MAX = 14;

/**
 * Desenează bila + trail + glow + shadow pe canvas.
 * canvasW/H = dimensiunile canvas-ului.
 * trail: ref extern modificat in-place (se adaugă punctul curent, se taie coadă).
 */
export function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: BallState,
  cellSize: number,
  trail: TrailPoint[],
  wallFlash: boolean,
  wallFlashScale: number, // 0.92..1.0 (micro-squash la coliziune)
): void {
  const { x, y, vx, vy } = ball;
  const r = cellSize / 3;
  const speed = Math.sqrt(vx * vx + vy * vy);
  const speedNorm = Math.min(speed / PHYSICS.maxSpeed, 1); // 0..1

  // Actualizare trail
  trail.unshift({ x, y });
  if (trail.length > TRAIL_MAX) trail.length = TRAIL_MAX;

  // ─── Trail ────────────────────────────────────────────────────────────────────
  for (let i = 1; i < trail.length; i++) {
    const frac = 1 - i / trail.length;
    const trailR = r * frac * 0.65 * (0.25 + speedNorm * 0.75);
    if (trailR < 0.5) continue;
    ctx.beginPath();
    ctx.arc(trail[i].x, trail[i].y, trailR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(96, 165, 250, ${frac * 0.28 * speedNorm})`;
    ctx.fill();
  }

  // ─── Shadow (contact shadow sub bilă, vizibil pe fundal întunecat) ───────────
  const shadowGrd = ctx.createRadialGradient(x + 2, y + r * 0.65, 0, x + 2, y + r * 0.65, r * 0.9);
  shadowGrd.addColorStop(0, 'rgba(0, 5, 20, 0.72)');
  shadowGrd.addColorStop(0.5, 'rgba(0, 5, 20, 0.35)');
  shadowGrd.addColorStop(1, 'rgba(0, 5, 20, 0)');
  ctx.save();
  ctx.scale(1, 0.38); // aplatizăm pe verticală → elipsă
  ctx.beginPath();
  ctx.arc(x + 2, (y + r * 0.65) / 0.38, r * 0.9, 0, Math.PI * 2);
  ctx.fillStyle = shadowGrd;
  ctx.fill();
  ctx.restore();

  // ─── Glow (speed-dependent) ───────────────────────────────────────────────────
  const glowR = r + 5 + speedNorm * 12;
  const glowAlpha = 0.12 + speedNorm * 0.3;
  const grd = ctx.createRadialGradient(x, y, r * 0.4, x, y, glowR);
  if (wallFlash) {
    grd.addColorStop(0, `rgba(251, 113, 133, ${glowAlpha + 0.2})`);
    grd.addColorStop(1, 'rgba(244, 63, 94, 0)');
  } else {
    grd.addColorStop(0, `rgba(147, 197, 253, ${glowAlpha})`);
    grd.addColorStop(1, 'rgba(59, 130, 246, 0)');
  }
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // ─── Bilă cu squash & stretch ─────────────────────────────────────────────────
  const angle = speed > 2 ? Math.atan2(vy, vx) : 0;
  const stretch = 1 + speedNorm * 0.20;
  const squash  = wallFlashScale * (1 - speedNorm * 0.10);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(stretch, squash);

  // Gradient 3D (highlight stânga-sus → albastru profund)
  const ballGrad = ctx.createRadialGradient(
    -r * 0.3, -r * 0.3, r * 0.05,
     r * 0.1,  r * 0.1, r * 1.1,
  );
  if (wallFlash) {
    ballGrad.addColorStop(0, '#fda4af');
    ballGrad.addColorStop(0.45, '#f43f5e');
    ballGrad.addColorStop(1, '#9f1239');
  } else {
    ballGrad.addColorStop(0, '#bfdbfe');
    ballGrad.addColorStop(0.45, '#3b82f6');
    ballGrad.addColorStop(1, '#1e3a8a');
  }

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = ballGrad;
  ctx.fill();

  ctx.restore();

  // Micro-highlight alb (specular) — fix în stânga-sus, nu se rotește cu bila
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
}
