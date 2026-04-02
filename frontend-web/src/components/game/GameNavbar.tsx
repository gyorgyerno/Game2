'use client';
import { Trophy, Crown } from 'lucide-react';
import { User } from '@integrame/shared';
import { isLabyrinthGameType } from '@/games/registry';

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

export default function GameNavbar({ user, xpGained, levelUp, gameType }: Props) {
  const isMaze = isLabyrinthGameType(gameType);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 ${
      isMaze
        ? 'bg-[#020617] border-b border-slate-800 shadow-none'
        : 'bg-white border-b border-gray-200 shadow-sm'
    }`}>
      <div className="w-[180px]" />

      {/* Center – empty, grid takes center */}
      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-3">

        {/* XP indicator */}
        <div
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
            isMaze
              ? 'bg-amber-500/10 border border-amber-500/30'
              : 'bg-amber-50 border border-amber-200'
          }`}>
          <Trophy size={15} className="text-amber-500" />
          <div className="flex flex-col leading-tight">
            <span className={`text-xs font-bold leading-none ${isMaze ? 'text-white' : 'text-gray-800'}`}>{xpGained ?? 0}</span>
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
            className={`w-8 h-8 rounded-full object-cover border-2 ${isMaze ? 'border-slate-700' : 'border-gray-200'}`}
          />
        )}
      </div>
    </nav>
  );
}
