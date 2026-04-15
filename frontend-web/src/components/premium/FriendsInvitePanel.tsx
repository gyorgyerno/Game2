'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { friendsApi, premiumRoomsApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { UserCheck, Bell, BellOff, Wifi, WifiOff, UserPlus } from 'lucide-react';

interface Friend {
  id: string;
  username: string;
  avatarUrl?: string;
  isOnline: boolean;
}

interface Props {
  roomId: string;
  /** IDs-urile userilor deja în cameră — pentru a marca "Deja în cameră" */
  playerIds: string[];
  /** Dacă userul curent este owner-ul camerei */
  isOwner?: boolean;
}

/**
 * Panou lateral cu lista de prieteni acceptați.
 * Buton "Invită" trimite notificare socket prietenului (nu e legat de sistemul de match existent).
 */
export default function FriendsInvitePanel({ roomId, playerIds, isOwner }: Props) {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  // Listener pentru confirmare că prietenul a intrat
  const playerIdsRef = useRef(playerIds);
  playerIdsRef.current = playerIds;

  useEffect(() => {
    friendsApi.list()
      .then(r => setFriends(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Ascultă premium_room:update pentru a detecta când un prieten invitat a intrat
  useEffect(() => {
    const socket = getSocket();
    const handler = ({ room }: any) => {
      const newIds: string[] = (room?.players ?? []).map((p: any) => p.userId);
      setInvited(prev => {
        const next = new Set(prev);
        next.forEach(id => { if (newIds.includes(id)) next.delete(id); });
        return next;
      });
    };
    socket.on('premium_room:update', handler);
    return () => { socket.off('premium_room:update', handler); };
  }, []);

  const handleInvite = async (friend: Friend) => {
    setInviting(friend.id);
    try {
      await premiumRoomsApi.inviteFriend(roomId, friend.id);
      setInvited(prev => new Set(prev).add(friend.id));
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Eroare la invitare.');
    } finally {
      setInviting(null);
    }
  };

  const onlineFriends = friends.filter(f => f.isOnline);
  const offlineFriends = friends.filter(f => !f.isOnline);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl flex flex-col h-full max-h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <UserCheck size={15} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-200">Prieteni</h3>
          {onlineFriends.length > 0 && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-semibold">
              {onlineFriends.length} online
            </span>
          )}
        </div>
        {isOwner && (
          <button
            onClick={() => router.push('/friends')}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-amber-400/25 bg-amber-400/8 text-amber-300 text-xs font-semibold hover:bg-amber-400/15 hover:border-amber-400/40 transition"
          >
            <UserPlus size={12} /> Adaugă prieten
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="overflow-y-auto flex-1 p-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-10 px-3">
            <p className="text-slate-500 text-sm">Nu ai prieteni adăugați.</p>
            <p className="text-slate-600 text-xs mt-1">Poți invita cu codul de cameră.</p>
          </div>
        ) : (
          <>
            {/* Online */}
            {onlineFriends.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-1">Online</p>
                {onlineFriends.map(f => (
                  <FriendRow
                    key={f.id}
                    friend={f}
                    inRoom={playerIds.includes(f.id)}
                    wasInvited={invited.has(f.id)}
                    isInviting={inviting === f.id}
                    onInvite={() => handleInvite(f)}
                  />
                ))}
              </div>
            )}

            {/* Offline */}
            {offlineFriends.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-1 mt-2">Offline</p>
                {offlineFriends.map(f => (
                  <FriendRow
                    key={f.id}
                    friend={f}
                    inRoom={playerIds.includes(f.id)}
                    wasInvited={invited.has(f.id)}
                    isInviting={inviting === f.id}
                    onInvite={() => handleInvite(f)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── FriendRow ────────────────────────────────────────────────────────────────
function FriendRow({
  friend, inRoom, wasInvited, isInviting, onInvite,
}: {
  friend: Friend;
  inRoom: boolean;
  wasInvited: boolean;
  isInviting: boolean;
  onInvite: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/[0.05] transition group">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-xs font-bold text-white">
          {friend.username[0]?.toUpperCase()}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0d0f17] ${
          friend.isOnline ? 'bg-green-400' : 'bg-slate-600'
        }`} />
      </div>

      {/* Nume */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{friend.username}</p>
        <p className={`text-[10px] flex items-center gap-1 ${friend.isOnline ? 'text-green-400' : 'text-slate-500'}`}>
          {friend.isOnline
            ? <><Wifi size={9} /> Online</>
            : <><WifiOff size={9} /> Offline</>}
        </p>
      </div>

      {/* Acțiune */}
      {inRoom ? (
        <span className="text-[10px] text-green-400 font-semibold shrink-0">✓ În cameră</span>
      ) : wasInvited ? (
        <span className="text-[10px] text-amber-300 font-semibold flex items-center gap-1 shrink-0">
          <Bell size={10} /> Invitat
        </span>
      ) : (
        <button
          onClick={onInvite}
          disabled={isInviting}
          className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-300 hover:bg-amber-400/25 disabled:opacity-50 transition whitespace-nowrap"
        >
          {isInviting ? '...' : '+ Invită'}
        </button>
      )}
    </div>
  );
}
