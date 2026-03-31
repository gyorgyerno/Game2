'use client';

/**
 * ContestCountdown
 * ─────────────────
 * Afișează un countdown vizual până la startul concursului.
 * Ultimele 60 de secunde: culoarea devine roșie + pulsație.
 */

import { useEffect, useState } from 'react';

interface Props {
  startAt: string; // ISO string
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function ContestCountdown({ startAt }: Props) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, new Date(startAt).getTime() - Date.now());
      setRemaining(Math.floor(diff / 1000));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startAt]);

  if (remaining <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-green-400 font-bold text-lg animate-pulse">
        <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
        Concursul a început!
      </div>
    );
  }

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const isUrgent = remaining <= 60;

  return (
    <div className={`flex flex-col items-center gap-1 ${isUrgent ? 'animate-pulse' : ''}`}>
      <p className={`text-xs font-medium tracking-widest uppercase ${isUrgent ? 'text-red-400' : 'text-gray-400'}`}>
        Concursul începe în
      </p>
      <div className="flex items-center gap-2">
        {hours > 0 && (
          <>
            <Segment value={hours} label="ore" urgent={isUrgent} />
            <Sep />
          </>
        )}
        <Segment value={minutes} label="min" urgent={isUrgent} />
        <Sep />
        <Segment value={seconds} label="sec" urgent={isUrgent} />
      </div>
    </div>
  );
}

function Segment({ value, label, urgent }: { value: number; label: string; urgent: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`text-4xl font-black tabular-nums ${
          urgent ? 'text-red-400' : 'text-white'
        }`}
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs text-gray-500 -mt-1">{label}</span>
    </div>
  );
}

function Sep() {
  return <span className="text-3xl font-black text-gray-600 mb-4">:</span>;
}
