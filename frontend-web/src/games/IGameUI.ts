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
  /**
   * Puzzle-ul curent (venit din backend/AI sau fallback local).
   * Tipul CrosswordPuzzle este reutilizat deocamdată — jocuri
   * viitoare pot extinde sau ignora acest câmp.
   */
  puzzle: CrosswordPuzzle;
  /**
   * Apelat de fiecare dată când jucătorul face progres
   * (răspuns corect sau greșit).
   */
  onProgress: (correctAnswers: number, mistakes: number) => void;
  /**
   * Apelat când jucătorul a terminat toate întrebările / a ieșit
   * din joc (nu și când expiră timer-ul — acela e gestionat de pagină).
   */
  onFinish: (correctAnswers: number, mistakes: number) => void;
}
