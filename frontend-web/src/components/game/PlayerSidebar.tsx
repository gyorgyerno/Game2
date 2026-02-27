'use client';
import { useState } from 'react';
import { Plus, Lock, Copy, Check } from 'lucide-react';
import { MatchPlayer } from '@integrame/shared';
import { invitesApi } from '@/lib/api';
import clsx from 'clsx';

interface Props {
  players: (MatchPlayer & { user?: { username: string; avatarUrl?: string } })[];
  maxPlayers: number;
  matchId: string;
  gameType: string;
  level: number;
  myUserId: string;
}

const INITIALS_BG = [
  'bg-rose-500', 'bg-violet-600', 'bg-sky-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500',
];

export default function PlayerSidebar({ players, maxPlayers, matchId, gameType, level, myUserId }: Props) {
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);

  async function handleInvite() {
    try {
      const { data } = await invitesApi.create({ matchId, gameType, level });
      const url = `${window.location.origin}/invite/${data.code}`;
      setInviteUrl(url);
      setShowInvitePanel(true);
    } catch { /* noop */ }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const emptySlots = Math.max(0, Math.min(4, maxPlayers) - players.length);

  // Eu primul, restul după
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.userId === myUserId) return -1;
    if (b.userId === myUserId) return 1;
    return 0;
  });

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-[180px] border-r border-gray-100 bg-white flex flex-col items-center pt-4 pb-6 gap-3 overflow-y-auto z-30">
      {/* Invite label */}
      <div className="text-[10px] text-center text-gray-400 font-medium px-2 leading-tight">
        Invită prieteni<br />la duel
      </div>

      {/* Players */}
      {sortedPlayers.map((p, idx) => {
        const isMe = p.userId === myUserId;
        const avatarUrl = p.user?.avatarUrl;
        const username = p.user?.username || 'Player';
        const initials = username.slice(0, 2).toUpperCase();
        const bgColor = INITIALS_BG[idx % INITIALS_BG.length];

        const statusClass = p.finishedAt ? 'finished' : 'active';

        return (
          <div key={p.userId} className="player-avatar-ring relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={username} />
            ) : (
              <div className={clsx(
                'w-full h-full rounded-full flex items-center justify-center text-white font-bold text-sm border-3 border-white',
                bgColor
              )}>
                {initials}
              </div>
            )}
            {/* Status badge */}
            <div className={clsx('status-dot', statusClass)}>
              {initials.slice(0, 2)}
            </div>
            {isMe && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-violet-600 rounded-full border border-white" />
            )}
          </div>
        );
      })}

      {/* Empty / invite slots */}
      {emptySlots > 0 && (
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={handleInvite}
            className="w-[88px] h-[88px] rounded-full border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:border-violet-400 hover:text-violet-500 hover:bg-violet-50 transition group"
          >
            <Plus size={20} className="group-hover:scale-110 transition-transform" />
            <Lock size={11} />
          </button>
          <button
            onClick={handleInvite}
            className="text-[10px] text-center text-violet-500 font-medium leading-tight hover:text-violet-700 transition px-1"
          >
            Invită un<br />prieten
          </button>
        </div>
      )}

      {/* Invite modal */}
      {showInvitePanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowInvitePanel(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[480px] mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">Invită un prieten la duel</h3>
              <button onClick={() => setShowInvitePanel(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Trimite linkul de mai jos prietenului tău. Expiră în 24 de ore.</p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <span className="flex-1 text-xs text-gray-700 font-mono truncate">{inviteUrl}</span>
              <button
                onClick={handleCopy}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition"
              >
                {copied ? <><Check size={13} /> Copiat!</> : <><Copy size={13} /> Copiază</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
