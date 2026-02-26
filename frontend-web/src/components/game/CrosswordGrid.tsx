'use client';
import React, { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';

export interface CrosswordWord {
  id: number;
  word: string;
  clue: string;
  row: number;        // 0-indexed top row of word
  col: number;        // 0-indexed left col
  direction: 'horizontal' | 'vertical';
  revealed?: boolean;
}

export interface CrosswordPuzzle {
  title: string;
  rows: number;
  cols: number;
  mainCol: number;    // the highlighted vertical column index
  words: CrosswordWord[];
}

type CellState = {
  letter: string;
  status: 'empty' | 'correct' | 'wrong' | 'filled';
};

interface Props {
  puzzle: CrosswordPuzzle;
  onWordComplete?: (wordId: number, correct: boolean) => void;
  onAllComplete?: (correctCount: number, totalCount: number) => void;
  /** Called whenever the active word changes (e.g. user click or auto-advance) */
  onActiveWordChange?: (word: CrosswordWord | null) => void;
  /** Called when a wrong letter was placed and then auto-cleared */
  onWrongLetter?: () => void;
  readonly?: boolean;
}

export default function CrosswordGrid({ puzzle, onWordComplete, onAllComplete, onActiveWordChange, onWrongLetter, readonly }: Props) {
  const firstHorizontal = puzzle.words.find((w) => w.direction === 'horizontal');
  const [activeWordId, setActiveWordId] = useState<number>(firstHorizontal?.id ?? puzzle.words[0]?.id ?? 1);
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [inputBuffer, setInputBuffer] = useState('');

  const activeWord = puzzle.words.find((w) => w.id === activeWordId);

  // Notify parent when the active word changes
  useEffect(() => {
    onActiveWordChange?.(activeWord ?? null);
  }, [activeWordId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build cell key
  const key = (r: number, c: number) => `${r},${c}`;

  // Which cells belong to each word
  function wordCells(w: CrosswordWord): { r: number; c: number }[] {
    return Array.from({ length: w.word.length }, (_, i) => ({
      r: w.direction === 'horizontal' ? w.row : w.row + i,
      c: w.direction === 'horizontal' ? w.col + i : w.col,
    }));
  }

  // Is a cell in the main column?
  const isMainCol = (c: number) => c === puzzle.mainCol;

  // Is a cell part of the active word?
  function isActiveCell(r: number, c: number) {
    if (!activeWord) return false;
    return wordCells(activeWord).some((cell) => cell.r === r && cell.c === c);
  }

  // Build grid map: which cells have letters
  const gridMap = React.useMemo(() => {
    const map: Record<string, { wordIds: number[]; letterIdx: Record<number, number> }> = {};
    puzzle.words.forEach((w) => {
      wordCells(w).forEach(({ r, c }, i) => {
        const k = key(r, c);
        if (!map[k]) map[k] = { wordIds: [], letterIdx: {} };
        map[k].wordIds.push(w.id);
        map[k].letterIdx[w.id] = i;
      });
    });
    return map;
  }, [puzzle]);

  // Cell number (clue number) – smallest wordId starting at this cell
  const cellNumbers = React.useMemo(() => {
    const nums: Record<string, number> = {};
    puzzle.words.forEach((w) => {
      const k = key(w.row, w.col);
      if (!nums[k] || w.id < nums[k]) nums[k] = w.id;
    });
    return nums;
  }, [puzzle]);

  // Get all cells that have content (from all words)
  const allGridCells = React.useMemo(() => {
    const s = new Set<string>();
    puzzle.words.forEach((w) => wordCells(w).forEach(({ r, c }) => s.add(key(r, c))));
    return s;
  }, [puzzle]);

  // Handle letter input from LetterTiles or keyboard
  const handleLetter = useCallback((letter: string) => {
    if (!activeWord || readonly) return;
    const wCells = wordCells(activeWord);

    // Find first unfilled cell in this word
    const target = wCells.find(({ r, c }) => !cells[key(r, c)]?.letter);
    if (!target) return;

    const k = key(target.r, target.c);
    const expected = activeWord.word[gridMap[k].letterIdx[activeWord.id]];
    const isCorrect = letter.toLowerCase() === expected.toLowerCase();

    setCells((prev) => ({ ...prev, [k]: { letter, status: isCorrect ? 'filled' : 'wrong' } }));

    // Auto-clear wrong letter after 700ms
    if (!isCorrect) {
      setTimeout(() => {
        setCells((prev) => {
          const next = { ...prev };
          if (next[k]?.status === 'wrong') delete next[k];
          return next;
        });
        onWrongLetter?.();
      }, 700);
      return; // don't advance word on wrong input
    }

    // Check if word complete
    const newCells = { ...cells, [k]: { letter, status: isCorrect ? 'filled' : 'wrong' } };
    const allFilled = wCells.every(({ r, c }) => newCells[key(r, c)]?.letter);
    if (allFilled) {
      const allCorrect = wCells.every(({ r, c }) => {
        const k2 = key(r, c);
        const exp = activeWord.word[gridMap[k2].letterIdx[activeWord.id]];
        return newCells[k2]?.letter?.toLowerCase() === exp.toLowerCase();
      });
      // Update statuses
      const updated = { ...newCells };
      wCells.forEach(({ r, c }) => {
        const k2 = key(r, c);
        const exp = activeWord.word[gridMap[k2].letterIdx[activeWord.id]];
        updated[k2] = {
          letter: updated[k2].letter,
          status: updated[k2].letter.toLowerCase() === exp.toLowerCase() ? 'correct' : 'wrong',
        };
      });
      setCells(updated as Record<string, CellState>);
      onWordComplete?.(activeWord.id, allCorrect);

      // Move to next incomplete word
      const nextWord = puzzle.words.find((w) => {
        if (w.id === activeWord.id) return false;
        return wordCells(w).some(({ r, c }) => !updated[key(r, c)]?.letter);
      });
      if (nextWord) setActiveWordId(nextWord.id);

      // Check all complete
      const allDone = puzzle.words.every((w) =>
        wordCells(w).every(({ r, c }) => updated[key(r, c)]?.letter)
      );
      if (allDone) {
        const correctWords = puzzle.words.filter((w) =>
          wordCells(w).every(({ r, c }) => {
            const k2 = key(r, c);
            const exp = w.word[gridMap[k2].letterIdx[w.id]];
            return updated[k2]?.letter?.toLowerCase() === exp.toLowerCase();
          })
        );
        onAllComplete?.(correctWords.length, puzzle.words.length);
      }
    }
  }, [activeWord, cells, gridMap, onWordComplete, onAllComplete, puzzle, readonly]);

  // Expose handleLetter globally for LetterTiles
  useEffect(() => {
    (window as any).__crosswordInput = handleLetter;
    return () => { delete (window as any).__crosswordInput; };
  }, [handleLetter]);

  // Keyboard input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (readonly) return;
      if (e.key === 'Backspace') {
        // Remove last filled cell in active word
        if (!activeWord) return;
        const wCells = wordCells(activeWord);
        const lastFilled = [...wCells].reverse().find(({ r, c }) => cells[key(r, c)]?.letter);
        if (lastFilled) {
          setCells((prev) => {
            const next = { ...prev };
            delete next[key(lastFilled.r, lastFilled.c)];
            return next;
          });
        }
        return;
      }
      if (/^[a-zA-ZăâîșțĂÂÎȘȚ]$/.test(e.key)) {
        handleLetter(e.key.toUpperCase());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleLetter, activeWord, cells, readonly]);

  // Determine bounding box
  let minR = 99, maxR = 0, minC = 99, maxC = 0;
  allGridCells.forEach((k) => {
    const [r, c] = k.split(',').map(Number);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  });

  const rows = Array.from({ length: maxR - minR + 1 }, (_, i) => i + minR);
  const cols = Array.from({ length: maxC - minC + 1 }, (_, i) => i + minC);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Grid */}
      <div
        className="inline-grid"
        style={{
          gridTemplateColumns: `repeat(${cols.length}, 44px)`,
          gridTemplateRows: `repeat(${rows.length}, 44px)`,
          gap: '0',
        }}
      >
        {rows.map((r) =>
          cols.map((c) => {
            const k = key(r, c);
            const hasCell = allGridCells.has(k);
            if (!hasCell) return <div key={k} style={{ width: 44, height: 44 }} />;

            const cellData = cells[k];
            const isActive = isActiveCell(r, c);
            const isMain = isMainCol(c);
            const num = cellNumbers[k];

            return (
              <div
                key={k}
                className={clsx(
                  'grid-cell',
                  isMain && 'active-col',
                  isActive && 'active-word',
                  cellData?.status === 'correct' && 'correct',
                  cellData?.status === 'wrong' && 'wrong'
                )}
                onClick={() => {
                  if (readonly) return;
                  const wordHere = gridMap[k]?.wordIds;
                  if (wordHere?.length) {
                    // Prefer horizontal words — skip the vertical main column word when cycling
                    const horizontalIds = wordHere.filter(
                      (wid) => puzzle.words.find((w) => w.id === wid)?.direction === 'horizontal'
                    );
                    const cycleIds = horizontalIds.length ? horizontalIds : wordHere;
                    const current = cycleIds.indexOf(activeWordId);
                    setActiveWordId(cycleIds[(current + 1) % cycleIds.length]);
                  }
                }}
              >
                {num && <span className="cell-number">{num}</span>}
                <span className="text-[18px] font-bold">{cellData?.letter || ''}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
