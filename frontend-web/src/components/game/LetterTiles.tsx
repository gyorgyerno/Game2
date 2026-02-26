'use client';
import { useState, useEffect } from 'react';
import clsx from 'clsx';

interface Props {
  letters: string[];
  onLetter?: (letter: string) => void;
}

export default function LetterTiles({ letters, onLetter }: Props) {
  const [used, setUsed] = useState<number[]>([]);

  // Reset used when letters change
  useEffect(() => setUsed([]), [letters.join('')]);

  function handleClick(letter: string, idx: number) {
    if (used.includes(idx)) return;
    setUsed((u) => [...u, idx]);
    if (onLetter) {
      onLetter(letter);
    } else {
      (window as any).__crosswordInput?.(letter);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {letters.map((l, idx) => (
        <button
          key={idx}
          onClick={() => handleClick(l, idx)}
          className={clsx('letter-tile', used.includes(idx) && 'used')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
