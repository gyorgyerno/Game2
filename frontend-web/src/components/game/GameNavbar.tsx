'use client';
import { useState } from 'react';
import { ChevronDown, Trophy, Crown } from 'lucide-react';
import { User } from '@integrame/shared';
import { getGameByType } from '@/games/registry';
import { useGamesCatalog } from '@/games/useGamesCatalog';

interface LevelUpNotif {
  level: number;
  show: boolean;
}

interface Props {
  user: User | null;
  xpGained?: number;
  levelUp?: LevelUpNotif;
  gameType: string;
  onGameChange?: (g: string) => void;
}

export default function GameNavbar({ user, xpGained, levelUp, gameType, onGameChange }: Props) {
  const [open, setOpen] = useState(false);
  const games = useGamesCatalog();
  const current = getGameByType(gameType) || games[0] || { id: 'integrame', label: 'Integrame', emoji: '📝' };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 shadow-sm">
      <div className="w-[180px]" />

      {/* Center – empty, grid takes center */}
      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Game type selector */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 bg-black text-white rounded-full px-4 py-1.5 text-sm font-semibold hover:bg-gray-800 transition"
          >
            <span className="text-base">+</span>
            {current.label}
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px]">
              {games.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { onGameChange?.(g.id); setOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-violet-50 ${g.id === gameType ? 'font-bold text-violet-700' : 'text-gray-700'}`}
                >
                  {g.emoji} {g.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* XP indicator */}
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
          <Trophy size={15} className="text-amber-500" />
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-bold text-gray-800 leading-none">{xpGained ?? 0}</span>
            <span className="text-[10px] text-amber-500 leading-none">{user?.xp ?? 0}xp</span>
          </div>
        </div>

        {/* Level up notification */}
        {levelUp?.show && (
          <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-300 rounded-full px-3 py-1 animate-bounce-in">
            <Crown size={15} className="text-yellow-500" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] text-gray-500 leading-none">Felicitări!</span>
              <span className="text-xs font-bold text-yellow-700 leading-none">Ai ajuns la Nivelul {levelUp.level}</span>
            </div>
          </div>
        )}

        {/* Avatar */}
        {user && (
          <img
            src={user.avatarUrl || `https://api.dicebear.com/8.x/personas/svg?seed=${user.username}`}
            alt={user.username}
            className="w-8 h-8 rounded-full border-2 border-gray-200 object-cover"
          />
        )}
      </div>
    </nav>
  );
}
