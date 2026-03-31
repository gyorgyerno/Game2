'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

interface Props {
  seconds: number;
  onExpire?: () => void;
}

export default function GameTimer({ seconds, onExpire }: Props) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    setLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    // seconds === 0 = fără limită de timp — nu pornește countdown-ul
    if (seconds === 0) return;
    if (left <= 0) { onExpire?.(); return; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, seconds]);

  // Mod infinit
  if (seconds === 0) {
    return (
      <p className="text-sm font-semibold text-gray-400">∞ Fără limită de timp</p>
    );
  }

  const urgent = left <= 30;
  const critical = left <= 10;
  const min = Math.floor(left / 60);
  const sec = String(left % 60).padStart(2, '0');

  return (
    <p className={clsx(
      'text-sm font-semibold transition-colors',
      critical ? 'text-red-500 animate-pulse' : urgent ? 'text-orange-500' : 'text-gray-500'
    )}>
      Au mai ramas {min > 0 ? `${min}:${sec}` : `${left}s`}
    </p>
  );
}
