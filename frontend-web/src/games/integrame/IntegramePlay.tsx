'use client';
import { useState, useMemo } from 'react';
import CrosswordGrid from '@/components/game/CrosswordGrid';
import LetterTiles from '@/components/game/LetterTiles';
import { shuffleLetters } from '@/lib/puzzles';
import type { GamePlayProps } from '../IGameUI';

/**
 * IntegramePlay — UI-ul jocului de integrame (crossword).
 * Gestionează starea internă: cuvântul activ, răspunsuri corecte/greșite.
 * Comunică progresul cu pagina prin callback-urile onProgress / onFinish.
 */
export default function IntegramePlay({ started, finished, puzzle, onProgress, onFinish }: GamePlayProps) {
  const [activeWordId, setActiveWordId] = useState(0);
  const [correctWords, setCorrectWords] = useState(0);
  const [wrongWords, setWrongWords] = useState(0);

  const activeWord = puzzle.words.find((w) => w.id === activeWordId) || puzzle.words[0];

  // Memoizat ca să nu se amestece literele la fiecare re-render.
  // Dependență pe activeWord?.word (nu activeWordId) ca să reacționeze și la puzzle schimbat (AI).
  const tileLetters = useMemo(
    () => (activeWord ? shuffleLetters(activeWord.word) : []),
    [activeWord?.word], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function handleWordComplete(wordId: number, correct: boolean) {
    const newCorrect = correctWords + (correct ? 1 : 0);
    const newWrong = wrongWords + (!correct ? 1 : 0);
    if (correct) setCorrectWords(newCorrect);
    else setWrongWords(newWrong);
    onProgress(newCorrect, newWrong);
  }

  function handleAllComplete(correct: number, total: number) {
    onFinish(correct, total - correct);
  }

  return (
    <div className="flex flex-col items-center gap-8 px-6 pb-32 w-full max-w-2xl">
      <CrosswordGrid
        key={puzzle.title}
        puzzle={puzzle}
        onWordComplete={handleWordComplete}
        onAllComplete={handleAllComplete}
        onActiveWordChange={(w) => { if (w) setActiveWordId(w.id); }}
        readonly={!started || finished}
      />

      {/* Letter tiles + clue + DEV rezolvare */}
      {started && !finished && (
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Definiția pentru cuvântul activ orizontal */}
          {activeWord && activeWord.direction === 'horizontal' && activeWord.clue && (
            <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-50 border border-violet-200 text-sm max-w-lg text-center">
              <span className="text-violet-400 font-semibold shrink-0">{activeWord.id}.</span>
              <span className="text-gray-700 font-medium">{activeWord.clue}</span>
            </div>
          )}

          <LetterTiles letters={tileLetters} />

          {/* DEV: cuvântul de rezolvare rapidă */}
          {activeWord && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200 text-sm">
              <span className="text-slate-400 font-medium">Rezolvare:</span>
              <span className="font-bold tracking-widest text-violet-600">{activeWord.word}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
