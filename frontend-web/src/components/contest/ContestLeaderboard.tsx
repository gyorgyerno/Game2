'use client';

/**
 * ContestLeaderboard
 * ───────────────────
 * Tabel live al celor mai buni jucători dintr-un concurs.
 * Suportă animații de rank change (highlight 2s pe liniile noi/schimbate).
 */

import { useEffect, useRef, useState } from 'react';
import { ContestLeaderboardEntry } from '@integrame/shared';

const LEAGUE_COLORS: Record<string, string> = {
  bronze: 'text-amber-600',
  silver: 'text-gray-400',
  gold: 'text-yellow-400',
  platinum: 'text-cyan-400',
  diamond: 'text-blue-400',
};

const RANK_MEDALS: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
};

interface Props {
  entries: ContestLeaderboardEntry[];
  currentUserId?: string;
  rounds: { id: string; order: number; label: string; gameType: string; minLevel: number; matchesCount: number }[];
  maxVisible?: number;
}

const GAME_LABELS: Record<string, string> = {
  integrame: '🧩 Integrame',
  labirinturi: '🌀 Labirint',
  slogane: '💬 Slogane',
};

export default function ContestLeaderboard({ entries, currentUserId, rounds, maxVisible = 50 }: Props) {
  const prevRanks = useRef<Map<string, number>>(new Map());
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newHighlights = new Set<string>();
    for (const e of entries) {
      const prev = prevRanks.current.get(e.userId);
      if (prev !== undefined && prev !== e.rank) {
        newHighlights.add(e.userId);
      }
    }
    if (newHighlights.size > 0) {
      setHighlighted(newHighlights);
      const timer = setTimeout(() => setHighlighted(new Set()), 2000);
      // Update prev ranks
      for (const e of entries) prevRanks.current.set(e.userId, e.rank);
      return () => clearTimeout(timer);
    }
    for (const e of entries) prevRanks.current.set(e.userId, e.rank);
  }, [entries]);

  const visible = entries.slice(0, maxVisible);

  if (visible.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <p className="text-2xl mb-2">🏁</p>
        <p className="text-sm">Niciun scor înregistrat încă.</p>
        <p className="text-xs text-gray-600 mt-1">Fii primul care joacă!</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-800 uppercase tracking-wider">
            <th className="py-2 px-3 text-left w-10">#</th>
            <th className="py-2 px-3 text-left">Jucător</th>
            {rounds.map(r => (
              <th key={r.id} className="py-2 px-3 text-right hidden sm:table-cell whitespace-nowrap">
                <span className="text-gray-600 mr-1">#{r.order}</span>
                {r.label || (GAME_LABELS[r.gameType] ?? r.gameType)}
              </th>
            ))}
            <th className="py-2 px-3 text-right font-bold">Total</th>
            <th className="py-2 px-3 text-right hidden sm:table-cell">Meciuri</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry, _idx) => {
            const isMe = entry.userId === currentUserId;
            const isChanged = highlighted.has(entry.userId);
            return (
              <tr
                key={entry.userId}
                className={`
                  border-b border-gray-800/50 transition-colors duration-300
                  ${isMe ? 'bg-violet-900/30' : 'hover:bg-gray-800/40'}
                  ${isChanged ? 'bg-yellow-900/20' : ''}
                `}
              >
                {/* Rank */}
                <td className="py-3 px-3 font-bold">
                  {RANK_MEDALS[entry.rank] ?? (
                    <span className="text-gray-500">{entry.rank}</span>
                  )}
                </td>

                {/* Jucător */}
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden">
                      {entry.avatarUrl ? (
                        <img src={entry.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span>{entry.username[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <span className={`font-semibold ${isMe ? 'text-violet-300' : 'text-white'}`}>
                        {entry.username}
                        {isMe && <span className="ml-1 text-xs text-violet-400">(tu)</span>}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Score per round */}
                {rounds.map(r => {
                  const rs = entry.rounds.find(rr => rr.roundId === r.id);
                  return (
                    <td key={r.id} className="py-3 px-3 text-right hidden sm:table-cell text-gray-300">
                      {rs && rs.score > 0 ? (
                        <span className="font-mono">{rs.score.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  );
                })}

                {/* Total */}
                <td className="py-3 px-3 text-right">
                  <span className={`font-bold text-base font-mono ${isMe ? 'text-violet-300' : 'text-white'}`}>
                    {entry.totalScore.toLocaleString()}
                  </span>
                </td>

                {/* Meciuri */}
                <td className="py-3 px-3 text-right hidden sm:table-cell text-gray-400">
                  {entry.matchesPlayed}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
