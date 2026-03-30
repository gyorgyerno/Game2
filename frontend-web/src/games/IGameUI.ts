/**
 * IGameUI — contractul UI pentru fiecare joc.
 * Orice componentă de joc (IntegramePlay, MazePlay, etc.)
 * trebuie să accepte aceste props.
 */

import type { CrosswordPuzzle } from '@/components/game/CrosswordGrid';

export interface GamePlayProps {
  /** Jocul a pornit (countdown terminat) */
  started: boolean;
  /** Jocul s-a terminat (timer expirat sau finalizat) */
  finished: boolean;
  /** Nivelul meciului curent (1..5) */
  level?: number;
  /**
   * Puzzle-ul curent (venit din backend/AI sau fallback local).
   * Tipul CrosswordPuzzle este reutilizat deocamdată — jocuri
   * viitoare pot extinde sau ignora acest câmp.
   */
  puzzle: CrosswordPuzzle;
  /**
   * Seed pentru generarea deterministă a labirintului.
   * Trimis de backend în MATCH_START — garantează că ambii jucători văd același labirint.
   * Ignorat de jocurile non-maze.
   */
  mazeSeed?: number;
  /**
   * Apelat de fiecare dată când jucătorul face progres
   * (răspuns corect sau greșit).
   */
  onProgress: (correctAnswers: number, mistakes: number, metrics?: Record<string, unknown>) => void;
  /**
   * Apelat când jucătorul a terminat toate întrebările / a ieșit
   * din joc (nu și când expiră timer-ul — acela e gestionat de pagină).
   */
  onFinish: (correctAnswers: number, mistakes: number, metrics?: Record<string, unknown>) => void;
}
