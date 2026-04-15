'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Crown, Plus, ChevronRight, Users, LogIn } from 'lucide-react';
import { premiumRoomsApi } from '@/lib/api';
import { PremiumRoomPublic } from '@integrame/shared';

interface Props {
  isPremium: boolean;
  userId?: string;
}

/**
 * Card pe Dashboard.
 * Premium: arată camerele active (max 3) + buton "Camerele mele".
 * Non-premium: teaser + camerele la care este invitat/participant.
 */
export default function PremiumRoomCard({ isPremium, userId }: Props) {
  const [rooms, setRooms] = useState<PremiumRoomPublic[]>([]);
  const [invitedRooms, setInvitedRooms] = useState<PremiumRoomPublic[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isPremium) {
      premiumRoomsApi.getMyRooms()
        .then(r => setRooms((r.data ?? []).slice(0, 3)))
        .catch(() => {})
        .finally(() => setLoaded(true));
    } else {
      // Non-premium: verificăm dacă a fost invitat în vreo cameră activă
      premiumRoomsApi.getMyRooms()
        .then(r => {
          const all: PremiumRoomPublic[] = r.data ?? [];
          // Camerele unde e participant dar nu owner
          setInvitedRooms(all.filter(room => room.ownerId !== userId).slice(0, 5));
        })
        .catch(() => {})
        .finally(() => setLoaded(true));
    }
  }, [isPremium, userId]);

  if (isPremium) {
    return (
      <div className="w-full max-w-[40rem] rounded-[28px] border border-amber-400/30 bg-gradient-to-br from-amber-400/10 via-yellow-400/5 to-transparent backdrop-blur-xl shadow-[0_4px_24px_rgba(251,191,36,0.12)] p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crown size={16} className="text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Premium</span>
          </div>
          <Link
            href="/premium-room"
            className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 transition font-semibold"
          >
            Toate camerele <ChevronRight size={13} />
          </Link>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-white">💎 Camere private</h3>
          <Link
            href="/premium-room/create"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 transition shadow-md shadow-amber-500/20 whitespace-nowrap"
          >
            <Plus size={13} /> Cameră nouă
          </Link>
        </div>

        {/* Rooms list */}
        {!loaded ? (
          <div className="h-10 flex items-center">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-400/20 bg-amber-400/5 p-4 text-center">
            <p className="text-sm text-slate-400 mb-3">Nu ai camere active.</p>
            <Link
              href="/premium-room/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 transition"
            >
              <Plus size={14} /> Crează prima cameră
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map(room => (
              <Link
                key={room.id}
                href={`/premium-room/${room.id}`}
                className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.05] hover:bg-amber-400/10 hover:border-amber-400/20 transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-400/15 flex items-center justify-center text-base shrink-0">
                  {room.mode === 'tournament' ? '🏆' : '⚡'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm font-mono">{room.code}</span>
                    {room.name && (
                      <span className="text-xs font-bold text-amber-200 uppercase tracking-wide">{room.name.toUpperCase()}</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      room.status === 'lobby'
                        ? 'bg-yellow-500/20 text-yellow-300'
                        : 'bg-green-500/20 text-green-300'
                    }`}>
                      {room.status === 'lobby' ? 'Lobby' : 'Activ'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-400">
                    <Users size={10} />
                    <span>{room.players.length}/{room.maxPlayers}</span>
                    {room.rounds.length > 0 && (
                      <span className="ml-1 capitalize">{room.rounds[0]?.gameType}</span>
                    )}
                    <span className="ml-auto text-[10px] text-slate-500">
                      {room.startAt
                        ? new Date(room.startAt).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : new Date(room.createdAt).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-600 group-hover:text-amber-300 transition shrink-0" />
              </Link>
            ))}
            <Link
              href="/premium-room"
              className="flex items-center justify-center gap-1.5 w-full pt-2 text-xs text-amber-400/70 hover:text-amber-300 transition font-semibold"
            >
              Vezi toate camerele <ChevronRight size={12} />
            </Link>
          </div>
        )}
      </div>
    );
  }

  // ── Teaser non-premium ────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-[40rem] space-y-3">
      {/* Camere la care este invitat */}
      {loaded && invitedRooms.length > 0 && (
        <div className="rounded-[28px] border border-blue-400/25 bg-blue-400/5 backdrop-blur-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <LogIn size={15} className="text-blue-400" />
            <h3 className="text-sm font-bold text-blue-300">Camere la care ești invitat</h3>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold">
              {invitedRooms.length}
            </span>
          </div>
          <div className="space-y-2">
            {invitedRooms.map(room => (
              <Link
                key={room.id}
                href={`/premium-room/${room.id}`}
                className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.05] hover:bg-blue-400/10 hover:border-blue-400/20 transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-400/15 flex items-center justify-center text-base shrink-0">
                  {room.mode === 'tournament' ? '🏆' : '⚡'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm font-mono">{room.code}</span>
                    {room.name && (
                      <span className="text-xs font-bold text-blue-200 uppercase tracking-wide">{room.name.toUpperCase()}</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      room.status === 'lobby' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'
                    }`}>
                      {room.status === 'lobby' ? 'Lobby' : 'Activ'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-400">
                    <Users size={10} />
                    <span>{room.players.length}/{room.maxPlayers}</span>
                    {room.rounds.length > 0 && (
                      <span className="ml-1 capitalize">{room.rounds[0]?.gameType}</span>
                    )}
                    <span className="ml-auto text-[10px] text-slate-500">
                      {room.startAt
                        ? new Date(room.startAt).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : new Date(room.createdAt).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-600 group-hover:text-blue-300 transition shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Teaser upgrade */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">💎</span>
              <h3 className="text-base font-bold text-white">Premium Private Room</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/25 text-amber-300 font-semibold">
                PREMIUM
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Invită prieteni, alege jocul, setezi regulile — orice joc disponibil.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Orice joc', 'Până la 8 jucători', 'Turneu', 'Rematch instant'].map((f) => (
                <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/60 text-slate-400">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <Link
            href="/premium-room"
            className="shrink-0 px-4 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 transition whitespace-nowrap shadow-md shadow-amber-500/15"
          >
            Vezi Premium
          </Link>
        </div>
      </div>
    </div>
  );
}

