'use client';
import type { GamePlayProps } from './IGameUI';
import IntegramePlay from './integrame/IntegramePlay';
import MazePlay from './maze/MazePlay';
import { getGameByType } from './registry';

/**
 * GameRenderer — punct unic de intrare pentru UI-ul unui joc.
 *
 * Cum se adaugă un joc nou:
 *  1. Creează `src/games/<nume>/<Nume>Play.tsx` ce implementează GamePlayProps
 *  2. Adaugă un `case '<nume>':` mai jos — o singură linie
 */
interface GameRendererProps extends GamePlayProps {
  gameType: string;
  difficultyValue?: number;
}

export default function GameRenderer({ gameType, difficultyValue, ...props }: GameRendererProps) {
  const gameDef = getGameByType(gameType);

  switch (gameDef?.uiVariant) {
    case 'maze':
      return <MazePlay {...props} difficultyValue={difficultyValue} />;
    default:
      return <IntegramePlay {...props} />;
  }
}
