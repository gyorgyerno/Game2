import type { Match, MatchPlayer } from '@integrame/shared';
import type { FrontendGameDefinition } from '@/games/registry';
import { isLabyrinthGameType } from '@/games/registry';

type MatchPlayerWithUser = MatchPlayer & { user?: { username: string; avatarUrl?: string } };

export interface OnlineFriend {
  id: string;
  username: string;
  avatarUrl?: string;
  isOnline: boolean;
}

interface GameLobbyPanelProps {
  gameDef: FrontendGameDefinition | undefined;
  match: (Omit<Match, 'players'> & { players: MatchPlayerWithUser[] }) | null;
  maxPlayers: number;
  isAI: boolean;
  allowInvite: boolean;
  linkCopied: boolean;
  onCopyLink: () => void;
  gameType?: string;
  onlineFriends?: OnlineFriend[];
  invitedFriendIds?: string[];
  onInviteFriend?: (friendId: string) => void;
}

// Mapare culoare → clase Tailwind (necesare pentru purge CSS să includă clasele)
const ACCENT_MAP: Record<string, {
  badge: string;
  border: string;
  text: string;
  dot: string;
  inviteBtn: string;
  inviteBtnCopied: string;
}> = {
  violet: {
    badge: 'bg-violet-100 border-violet-300 text-violet-700',
    border: 'border-violet-200',
    text: 'text-violet-600',
    dot: 'bg-violet-500',
    inviteBtn: 'bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100',
    inviteBtnCopied: 'bg-green-50 border-green-300 text-green-700',
  },
  emerald: {
    badge: 'bg-emerald-100 border-emerald-300 text-emerald-700',
    border: 'border-emerald-200',
    text: 'text-emerald-600',
    dot: 'bg-emerald-500',
    inviteBtn: 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100',
    inviteBtnCopied: 'bg-green-50 border-green-300 text-green-700',
  },
  sky: {
    badge: 'bg-sky-100 border-sky-300 text-sky-700',
    border: 'border-sky-200',
    text: 'text-sky-600',
    dot: 'bg-sky-500',
    inviteBtn: 'bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100',
    inviteBtnCopied: 'bg-green-50 border-green-300 text-green-700',
  },
  orange: {
    badge: 'bg-orange-100 border-orange-300 text-orange-700',
    border: 'border-orange-200',
    text: 'text-orange-600',
    dot: 'bg-orange-500',
    inviteBtn: 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100',
    inviteBtnCopied: 'bg-green-50 border-green-300 text-green-700',
  },
};

export default function GameLobbyPanel({
  gameDef,
  match,
  maxPlayers,
  isAI,
  allowInvite,
  linkCopied,
  onCopyLink,
  gameType,
  onlineFriends = [],
  invitedFriendIds = [],
  onInviteFriend,
}: GameLobbyPanelProps) {
  const accent = ACCENT_MAP[gameDef?.accentColor ?? 'violet'];
  const playerCount = match?.players.length ?? 0;
  const allReady = playerCount >= maxPlayers;
  const isMaze = isLabyrinthGameType(gameType ?? '');

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">





      {/* ── Așteptare jucători ── */}
      <div className={`w-full rounded-2xl border px-5 py-4 flex flex-col items-center gap-3 ${
        isMaze
          ? 'border-slate-700 bg-slate-800/60 backdrop-blur-md'
          : `${accent.border} bg-white/70`
      }`}>
        {/* Indicatori jucători */}
        <div className="flex items-center gap-3">
          {Array.from({ length: maxPlayers }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                i < playerCount
                  ? `border-transparent ${accent.dot} text-white`
                  : isMaze
                    ? 'border-dashed border-slate-600 bg-slate-700/50 text-slate-500'
                    : 'border-dashed border-gray-300 bg-gray-50 text-gray-300'
              }`}>
                {i < playerCount ? ((match?.players[i]?.user?.username || match?.players[i]?.username || '?')[0]?.toUpperCase() ?? '?') : '?'}
              </div>
              <span className={`text-xs ${isMaze ? 'text-slate-400' : 'text-gray-400'}`}>
                {i < playerCount ? (match?.players[i]?.user?.username || match?.players[i]?.username || '…') : '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Status text */}
        {allReady ? (
          <p className={`text-sm font-semibold ${accent.text}`}>
            ✅ Toți jucătorii sunt pregătiți!
          </p>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full animate-pulse ${accent.dot}`} />
              <p className={`text-sm font-medium ${isMaze ? 'text-slate-300' : 'text-gray-500'}`}>
                Se așteaptă jucători… ({playerCount}/{maxPlayers})
              </p>
            </div>
            <p className={`text-xs ${isMaze ? 'text-slate-500' : 'text-gray-400'}`}>Meciul pornește automat când sunt toți prezenți</p>
          </div>
        )}
      </div>

      {/* ── Info nivel ── */}
      {match && (
        <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${
          isMaze
            ? 'bg-slate-800/80 text-slate-400 border-slate-700'
            : 'bg-slate-100 text-slate-500 border-slate-200'
        }`}>
          🎯 Nivel {match.level} · max {maxPlayers} jucători · celălalt jucător trebuie să selecteze același nivel
        </div>
      )}

      {/* ── Invite button (link) ── */}
      {allowInvite && !allReady && (
        <button
          onClick={onCopyLink}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
            linkCopied ? accent.inviteBtnCopied : accent.inviteBtn
          }`}
        >
          {linkCopied ? (
            <><span>✓</span> Link copiat!</>
          ) : (
            <><span>🔗</span> Copiază link invitație</>
          )}
        </button>
      )}

      {/* ── Prieteni online ── */}
      {allowInvite && !allReady && onlineFriends.length > 0 && (
        <div className={`w-full rounded-2xl border px-4 py-3 ${
          isMaze ? 'border-slate-700 bg-slate-800/60' : `${accent.border} bg-white/70`
        }`}>
          <p className={`text-xs font-semibold mb-2 ${
            isMaze ? 'text-slate-400' : 'text-gray-400'
          }`}>👥 Prieteni online</p>
          <div className="flex flex-col gap-2">
            {onlineFriends.map((f) => {
              const alreadyInMatch = match?.players.some((p) => (p as any).userId === f.id || (p as any).user?.id === f.id);
              const invited = invitedFriendIds.includes(f.id);
              return (
                <div key={f.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      isMaze ? 'bg-slate-600' : 'bg-violet-400'
                    }`}>
                      {f.username[0]?.toUpperCase()}
                    </div>
                    <span className={`text-sm font-medium ${
                      isMaze ? 'text-slate-300' : 'text-gray-700'
                    }`}>{f.username}</span>
                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block" title="Online" />
                  </div>
                  {alreadyInMatch ? (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isMaze ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-400'
                    }`}>În meci ✓</span>
                  ) : invited ? (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      isMaze ? 'bg-slate-700 text-emerald-400' : 'bg-green-50 text-green-600'
                    }`}>Invitat ✓</span>
                  ) : (
                    <button
                      onClick={() => onInviteFriend?.(f.id)}
                      className={`text-xs px-3 py-1 rounded-full font-semibold transition-all border ${
                        isMaze
                          ? 'border-emerald-600 text-emerald-400 hover:bg-emerald-900/40'
                          : `${accent.inviteBtn}`
                      }`}
                    >
                      Invită
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
