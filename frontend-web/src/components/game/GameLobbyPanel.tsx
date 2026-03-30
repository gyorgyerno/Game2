import type { Match } from '@integrame/shared';
import type { FrontendGameDefinition } from '@/games/registry';

interface GameLobbyPanelProps {
  gameDef: FrontendGameDefinition | undefined;
  match: Match | null;
  maxPlayers: number;
  isAI: boolean;
  allowInvite: boolean;
  linkCopied: boolean;
  onCopyLink: () => void;
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
}: GameLobbyPanelProps) {
  const accent = ACCENT_MAP[gameDef?.accentColor ?? 'violet'];
  const playerCount = match?.players.length ?? 0;
  const allReady = playerCount >= maxPlayers;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">

      {/* ── Titlu joc ── */}
      <div className="flex items-center gap-3">
        <span className="text-4xl">{gameDef?.emoji ?? '🎮'}</span>
        <div>
          <h2 className="text-xl font-black text-gray-800">{gameDef?.label ?? 'Joc'}</h2>
          {gameDef?.howToPlay && (
            <p className="text-xs text-gray-500 max-w-[220px] leading-snug">{gameDef.howToPlay}</p>
          )}
        </div>
      </div>

      {/* ── Badge-uri ── */}
      <div className="flex flex-wrap justify-center gap-2">
        {isAI && (
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${accent.badge}`}>
            🤖 Puzzle generat de AI
          </span>
        )}
        {gameDef?.controlsHint && (
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${accent.badge}`}>
            🎮 {gameDef.controlsHint}
          </span>
        )}
      </div>

      {/* ── Așteptare jucători ── */}
      <div className={`w-full rounded-2xl border ${accent.border} bg-white/70 px-5 py-4 flex flex-col items-center gap-3`}>
        {/* Indicatori jucători */}
        <div className="flex items-center gap-3">
          {Array.from({ length: maxPlayers }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                i < playerCount
                  ? `border-transparent ${accent.dot} text-white`
                  : 'border-dashed border-gray-300 bg-gray-50 text-gray-300'
              }`}>
                {i < playerCount ? (match?.players[i]?.username?.[0]?.toUpperCase() ?? '?') : '?'}
              </div>
              <span className="text-xs text-gray-400">
                {i < playerCount ? (match?.players[i]?.username ?? '…') : '—'}
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
              <p className="text-sm text-gray-500 font-medium">
                Se așteaptă jucători… ({playerCount}/{maxPlayers})
              </p>
            </div>
            <p className="text-xs text-gray-400">Meciul pornește automat când sunt toți prezenți</p>
          </div>
        )}
      </div>

      {/* ── Info nivel ── */}
      {match && (
        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          🎯 Nivel {match.level} · max {maxPlayers} jucători · celălalt jucător trebuie să selecteze același nivel
        </div>
      )}

      {/* ── Invite button ── */}
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
            <><span>🔗</span> Invită un prieten</>
          )}
        </button>
      )}
    </div>
  );
}
