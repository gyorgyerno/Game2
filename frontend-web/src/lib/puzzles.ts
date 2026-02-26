import { CrosswordPuzzle } from '@/components/game/CrosswordGrid';

// Sample puzzle: main vertical word is "ALPINIST" (col 4, rows 2–9)
// Horizontal words cross it at different rows

export const SAMPLE_INTEGRAMA: CrosswordPuzzle = {
  title: 'Integrama Demo',
  rows: 10,
  cols: 9,
  mainCol: 4, // the violet column (0-indexed)
  words: [
    // Vertical – main word (reads top-to-bottom, col 4)
    {
      id: 0,
      word: 'ALPINIST',
      clue: 'Sportiv care urcă în vârf de munte',
      row: 2,
      col: 4,
      direction: 'vertical',
    },
    // Horizontal words that intersect the main column
    {
      id: 1,
      word: 'AVION',
      clue: 'Mijloc de transport aerian',
      row: 2,
      col: 2,
      direction: 'horizontal',
    },
    {
      id: 2,
      word: 'LALEA',
      clue: 'Floare de primăvară',
      row: 4,
      col: 2,
      direction: 'horizontal',
    },
    {
      id: 3,
      word: 'PIN',
      clue: 'Arbore rășinos',
      row: 6,
      col: 3,
      direction: 'horizontal',
    },
    {
      id: 4,
      word: 'NATA',
      clue: 'A înota (forma arhaică)',
      row: 8,
      col: 3,
      direction: 'horizontal',
    },
  ],
};

// Shuffle letters of the active word for LetterTiles
export function shuffleLetters(word: string): string[] {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
