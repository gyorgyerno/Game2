'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';

interface InvitePayload {
  matchId: string;
  gameType: string;
  level: number;
  fromUserId: string;
  fromUsername: string;
  fromAvatarUrl?: string;
}

const GAME_LABELS: Record<string, string> = {
  integrame: 'Integramă',
  labirinturi: 'Labirint',
  maze: 'Labirint',
  slogane: 'Slogane',
};

export default function GlobalInviteToast() {
  const { token, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Așteptăm hydration Zustand — până atunci token e null indiferent
    if (!_hasHydrated || !token) return;

    const socket = getSocket();

    const handleInvite = (payload: InvitePayload) => {
      setInvite(payload);
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), 15000);
    };

    socket.on('friend_invite_received', handleInvite);
    return () => {
      socket.off('friend_invite_received', handleInvite);
    };
  }, [_hasHydrated, token]);

  if (!visible || !invite) return null;

  const gameLabel = GAME_LABELS[invite.gameType] ?? invite.gameType;

  function handleAccept() {
    if (!invite) return;
    setVisible(false);
    router.push(`/games/${invite.gameType}/play?matchId=${invite.matchId}&mode=friends`);
  }

  function handleDecline() {
    setVisible(false);
  }

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: '#1e293b', border: '1px solid #334155',
        borderRadius: 16, padding: '16px 20px', minWidth: 300, maxWidth: 360,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', background: '#334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 16, color: '#e2e8f0', flexShrink: 0,
        }}>
          {invite.fromUsername[0]?.toUpperCase()}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
            🎮 Invitație la meci!
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
            <strong style={{ color: '#e2e8f0' }}>{invite.fromUsername}</strong>{' '}
            te invită la {gameLabel} · Nivel {invite.level}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleAccept}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
            background: '#10b981', color: '#fff', fontWeight: 700,
            fontSize: 13, cursor: 'pointer',
          }}
        >
          ✅ Acceptă
        </button>
        <button
          onClick={handleDecline}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 8,
            border: '1px solid #475569', background: 'transparent',
            color: '#94a3b8', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          Refuză
        </button>
      </div>
    </div>
  );
}
