'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Play, ChevronDown, BookOpen, Star, Link2, Copy, Check, X, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { matchesApi, invitesApi, statsApi, api, contestsApi } from '@/lib/api';
import { Match, UserGameStats, UserGameRating } from '@integrame/shared';
import Navbar from '@/components/Navbar';
import { hydrateIntegrameProgressFromServer, isCompleted, isUnlocked } from '@/store/gameProgress';
import { useGamesCatalog } from '@/games/useGamesCatalog';
import { hydrateMazeProgressFromServer } from '@/store/mazeSoloProgress';
import PremiumRoomCard from '@/components/premium/PremiumRoomCard';

const INVITE_TTL_SECONDS = 300;
const RANDOM_ACCEPT_TTL_SECONDS = 10;

type PublicLevelConfig = {
  level: number;
  displayName: string;
  winsToUnlock: number;
  gamesPerLevel: number;
  maxPlayers: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const games = useGamesCatalog();
  const { user, fetchMe, token, _hasHydrated } = useAuthStore();
  const [selectedGame, setSelectedGame] = useState('integrame');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [loading, setLoading] = useState(false);
  const [playError, setPlayError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [aiInviteLoading, setAiInviteLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteSecondsLeft, setInviteSecondsLeft] = useState<number | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<UserGameStats[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTheme, setAiTheme] = useState('general');
  const [showAiThemes, setShowAiThemes] = useState(false);
  const [showNormalConfirm, setShowNormalConfirm] = useState(false);
  const [showAiConfirm, setShowAiConfirm] = useState(false);
  const [showRandomAccept, setShowRandomAccept] = useState(false);
  const [pendingRandomMatchId, setPendingRandomMatchId] = useState('');
  const [randomAcceptSecondsLeft, setRandomAcceptSecondsLeft] = useState<number | null>(null);
  const [randomDecisionLoading, setRandomDecisionLoading] = useState(false);
  const [selectedDashboardGame, setSelectedDashboardGame] = useState<string | null>(null);
  const [selectedSoloGame, setSelectedSoloGame] = useState('integrame');
  const [mazeCompleted, setMazeCompleted] = useState<Set<string>>(new Set());
  const [selectedGameLevels, setSelectedGameLevels] = useState<PublicLevelConfig[]>([]);
  const [mazeSoloLevels, setMazeSoloLevels] = useState<PublicLevelConfig[]>([]);
  const [levelUnlockConfig, setLevelUnlockConfig] = useState<Record<number, number>>({});
  const [integrameSoloLevels, setIntegrameSoloLevels] = useState<PublicLevelConfig[]>([]); 
  const [soloDashMounted, setSoloDashMounted] = useState(false);
  const [activeContests, setActiveContests] = useState<any[]>([]);
  const [joiningContest, setJoiningContest] = useState<string | null>(null);
  const [gameRatings, setGameRatings] = useState<UserGameRating[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);

  const requestedGameRaw = (searchParams.get('game') || '').toLowerCase();
  const requestedGame = requestedGameRaw === 'maze' ? 'labirinturi' : requestedGameRaw;

  const AI_THEME_LABELS: Record<string, string> = {
    general: '🎲 General',
    stiinta: '🔬 Știință',
    film: '🎥 Film',
    sport: '⚽ Sport',
    geografie: '🌍 Geografie',
    muzica: '🎵 Muzică',
    gastronomie: '🍝 Gastronomie',
    natura: '🌿 Natură',
    istorie: '🏰 Istorie',
  };

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    fetchMe();
    statsApi.getMyStats().then((r) => setStats(r.data)).catch(() => {});
    statsApi.getMyGameRatings().then((r) => setGameRatings(r.data)).catch(() => {});
    matchesApi.getHistory().then((r) => setRecentMatches(r.data)).catch(() => {});
    const fetchContests = () =>
      contestsApi.list().then((r) => setActiveContests(r.data.contests ?? [])).catch(() => {});
    fetchContests();
    const contestInterval = setInterval(fetchContests, 60_000);
    return () => clearInterval(contestInterval);
  }, [_hasHydrated, token]);

  useEffect(() => {
    api.get<PublicLevelConfig[]>(`/games/levels/${selectedGame}`)
      .then((r) => {
        const map: Record<number, number> = {};
        for (const item of r.data) map[item.level] = item.winsToUnlock;
        setLevelUnlockConfig(map);
        setSelectedGameLevels([...r.data].sort((a, b) => a.level - b.level));
      })
      .catch(() => {});
  }, [selectedGame]);

  useEffect(() => {
    hydrateIntegrameProgressFromServer()
      .catch(() => {})
      .finally(() => setSoloDashMounted(true));
  }, []);

  useEffect(() => {
    api.get<PublicLevelConfig[]>('/games/levels/integrame')
      .then((r) => {
        setIntegrameSoloLevels([...r.data].sort((a, b) => a.level - b.level));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get<PublicLevelConfig[]>('/games/levels/labirinturi')
      .then((r) => {
        setMazeSoloLevels([...r.data].sort((a, b) => a.level - b.level));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (games.length === 0) return;
    const exists = games.some((game) => game.id === selectedGame);
    if (!exists) {
      setSelectedGame(games[0]?.id || 'integrame');
    }
  }, [games, selectedGame]);

  useEffect(() => {
    if (games.length === 0) return;
    if (!requestedGame) {
      if (selectedDashboardGame !== null) {
        setSelectedDashboardGame(null);
      }
      return;
    }
    const exists = games.some((g) => g.id === requestedGame);
    if (exists) {
      if (requestedGame !== selectedGame) {
        setSelectedGame(requestedGame);
      }
      if (requestedGame !== selectedSoloGame) {
        setSelectedSoloGame(requestedGame);
      }
      if (requestedGame !== selectedDashboardGame) {
        setSelectedDashboardGame(requestedGame);
      }
      setSelectedLevel(1);
    }
  }, [requestedGame, games, selectedGame, selectedSoloGame, selectedDashboardGame]);

  useEffect(() => {
    if (!selectedDashboardGame || games.length === 0) return;
    const exists = games.some((game) => game.id === selectedDashboardGame);
    if (!exists) {
      setSelectedDashboardGame(null);
    }
  }, [games, selectedDashboardGame]);

  useEffect(() => {
    if (games.length === 0) return;
    const exists = games.some((game) => game.id === selectedSoloGame);
    if (!exists) {
      setSelectedSoloGame(games[0]?.id || 'integrame');
    }
  }, [games, selectedSoloGame]);

  useEffect(() => {
    if (!_hasHydrated || !token) return;
    hydrateMazeProgressFromServer().then(setMazeCompleted).catch(() => {});
  }, [_hasHydrated, token]);

  useEffect(() => {
    if (!inviteExpiresAt) return;

    const timer = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((inviteExpiresAt - Date.now()) / 1000));
      setInviteSecondsLeft(secondsLeft);

      if (secondsLeft === 0) {
        setInviteUrl('');
        setInviteExpiresAt(null);
        setCopied(false);
        setPlayError('Invitația a expirat. Poți genera una nouă.');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [inviteExpiresAt]);

  useEffect(() => {
    if (!showRandomAccept) return;

    setRandomAcceptSecondsLeft(RANDOM_ACCEPT_TTL_SECONDS);

    const timer = setInterval(() => {
      setRandomAcceptSecondsLeft((prev) => {
        if (prev === null) return RANDOM_ACCEPT_TTL_SECONDS;
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showRandomAccept]);

  useEffect(() => {
    if (!showRandomAccept || randomAcceptSecondsLeft !== 0 || !pendingRandomMatchId) return;

    setRandomDecisionLoading(true);
    matchesApi.declineRandomMatch(pendingRandomMatchId)
      .catch(() => {})
      .finally(() => {
        setRandomDecisionLoading(false);
        setShowRandomAccept(false);
        setPendingRandomMatchId('');
        setRandomAcceptSecondsLeft(null);
        setPlayError('Nu ai confirmat la timp. Căutăm din nou când apeși Joacă normal.');
      });
  }, [showRandomAccept, randomAcceptSecondsLeft, pendingRandomMatchId]);

  if (!_hasHydrated) return <div className="min-h-screen" style={{ background: '#020617' }} />;

  async function handlePlay() {
    setLoading(true);
    setPlayError('');
    setInviteUrl('');
    setInviteExpiresAt(null);
    setInviteSecondsLeft(null);
    setCopied(false);
    try {
      const response = await matchesApi.findOrCreate(selectedGame, effectiveLevel, false);
      const data = response.data;

      if (response.status === 200 && data?.id) {
        setPendingRandomMatchId(data.id);
        setShowRandomAccept(true);
        return;
      }

      router.push(`/games/${selectedGame}/play?matchId=${data.id}`);
    } catch (e: any) {
      const code = e?.code;
      const status = e?.response?.status;
      const msg = (code === 'ECONNABORTED' || code === 'ERR_NETWORK')
        ? 'Nu se poate conecta la server (port 4000). Repornește backend-ul.'
        : status === 401
          ? 'Sesiunea a expirat. Te rugăm să te autentifici din nou.'
          : e?.response?.data?.error || 'Eroare la pornirea meciului.';
      setPlayError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function acceptRandomMatch() {
    if (!pendingRandomMatchId) return;
    setRandomDecisionLoading(true);
    setShowRandomAccept(false);
    setRandomAcceptSecondsLeft(null);
    const matchId = pendingRandomMatchId;
    setPendingRandomMatchId('');
    router.push(`/games/${selectedGame}/play?matchId=${matchId}`);
  }

  async function declineRandomMatch() {
    if (!pendingRandomMatchId) return;
    setRandomDecisionLoading(true);
    try {
      await matchesApi.declineRandomMatch(pendingRandomMatchId);
      setPlayError('Ai refuzat meciul random. Poți încerca din nou.');
    } catch {
      setPlayError('Nu s-a putut refuza meciul. Încearcă din nou.');
    } finally {
      setRandomDecisionLoading(false);
      setShowRandomAccept(false);
      setPendingRandomMatchId('');
      setRandomAcceptSecondsLeft(null);
    }
  }

  async function handlePlayAI() {
    setAiLoading(true);
    setPlayError('');
    try {
      // Creează/găsește meciul și redirectează imediat (puzzle-ul se generează pe play page)
      const { data: match } = await matchesApi.findOrCreate(selectedGame, effectiveLevel, true);
      router.push(`/games/${selectedGame}/play?matchId=${match.id}&ai=1&level=${effectiveLevel}&theme=${aiTheme}`);
    } catch (e: any) {
      setPlayError(e?.response?.data?.error || 'Eroare la pornirea meciului AI.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleInvite(options?: { isAI?: boolean; aiTheme?: string }) {
    const isAIInvite = !!options?.isAI;
    if (isAIInvite) {
      setAiInviteLoading(true);
    } else {
      setInviteLoading(true);
    }
    setPlayError('');
    try {
      const { data } = await invitesApi.create({
        gameType: selectedGame,
        level: effectiveLevel,
        ttlSeconds: INVITE_TTL_SECONDS,
        isAI: isAIInvite,
        aiTheme: options?.aiTheme,
      });
      if (data.hostPlayUrl) {
        window.location.href = data.hostPlayUrl;
        return;
      }
      setInviteUrl(data.inviteUrl);
      const expiresAtTs = data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + INVITE_TTL_SECONDS * 1000;
      setInviteExpiresAt(expiresAtTs);
      setInviteSecondsLeft(Math.max(0, Math.ceil((expiresAtTs - Date.now()) / 1000)));
      setCopied(false);
    } catch (e: any) {
      if (isAIInvite) {
        try {
          const { data } = await invitesApi.create({
            gameType: selectedGame,
            level: effectiveLevel,
            ttlSeconds: INVITE_TTL_SECONDS,
          });

          if (data.hostPlayUrl) {
            const url = new URL(data.hostPlayUrl, window.location.origin);
            url.searchParams.set('ai', '1');
            url.searchParams.set('level', String(effectiveLevel));
            if (options?.aiTheme) {
              url.searchParams.set('theme', options.aiTheme);
            }
            window.location.href = url.toString();
            return;
          }
        } catch {
          // ignore and show generic error below
        }
      }

      const errorMsg = e?.response?.data?.error || 'Eroare la generarea invitației';
      setPlayError(errorMsg);
    } finally {
      if (isAIInvite) {
        setAiInviteLoading(false);
      } else {
        setInviteLoading(false);
      }
    }
  }

  function copyInviteUrl() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function formatSeconds(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function handleOpenGameDetails(gameId: string) {
    setSelectedDashboardGame(gameId);
    setSelectedGame(gameId);
    setSelectedSoloGame(gameId);
    setSelectedLevel(1);
    setShowAiThemes(false);
    router.replace(`/dashboard?game=${gameId}`);
  }

  function handleBackToGameCards() {
    setSelectedDashboardGame(null);
    setShowAiThemes(false);
    router.replace('/dashboard');
  }

  if (!user) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#020617' }}><div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  // Level unlock logic: each level requires winsToUnlock wins at the previous level (configured in admin)
  const winsNeeded = (lvl: number) => levelUnlockConfig[lvl] ?? 5;
  const availableLevels = selectedGameLevels.length > 0 ? selectedGameLevels.map((cfg) => cfg.level) : [1, 2, 3, 4, 5];
  const firstAvailableLevel = availableLevels[0] ?? 1;
  const maxPlayersForLevel = (lvl: number) => selectedGameLevels.find((cfg) => cfg.level === lvl)?.maxPlayers ?? 2;
  // 'labirinturi' și 'maze' sunt același joc — stats pot fi salvate sub oricare
  const matchesGame = (statGameType: string) =>
    statGameType === selectedGame ||
    (selectedGame === 'labirinturi' && statGameType === 'maze') ||
    (selectedGame === 'maze' && statGameType === 'labirinturi');
  const levelWins = (lvl: number) =>
    stats.find((s) => matchesGame(s.gameType) && s.level === lvl)?.wins ?? 0;
  const unlockedLevels = new Set<number>([firstAvailableLevel]);
  for (let index = 1; index < availableLevels.length; index += 1) {
    const lvl = availableLevels[index]!;
    const prevLevel = availableLevels[index - 1]!;
    if (unlockedLevels.has(prevLevel) && levelWins(prevLevel) >= winsNeeded(lvl)) {
      unlockedLevels.add(lvl);
    } else {
      break;
    }
  }
  const effectiveLevel = unlockedLevels.has(selectedLevel) ? selectedLevel : firstAvailableLevel;
  // Next level that is locked (to show requirement hint)
  const nextLockedLevel = availableLevels.slice(1).find((lvl) => !unlockedLevels.has(lvl));
  const glassCard = 'rounded-[28px] border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(0,0,0,0.2)]';
  const levelCard = 'rounded-[22px] border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 transition-all hover:scale-[1.02] min-h-[140px] md:min-h-[160px] flex flex-col items-center justify-center shadow-lg shadow-black/30';
  const lockedLevelCard = 'rounded-[22px] border border-slate-700/50 bg-slate-800/40 opacity-60 min-h-[120px] md:min-h-[130px] flex flex-col items-center justify-center';
  const soloActionBtnBase = 'mt-4 md:mt-8 mx-auto w-full max-w-[170px] px-4 md:px-6 py-2.5 rounded-full text-[15px] font-semibold inline-flex items-center justify-center gap-2';
  const soloPlayBtn = `${soloActionBtnBase} bg-emerald-600 text-white hover:bg-emerald-500`;
  const soloDisabledBtn = `${soloActionBtnBase} bg-transparent border border-slate-600 text-slate-500 cursor-not-allowed`;
  const showGameDetails = !!selectedDashboardGame;
  const soloGameInView = selectedDashboardGame ?? selectedSoloGame;
  const selectedDashboardGameDef = games.find((g) => g.id === selectedDashboardGame);
  const selectedGameRating = gameRatings.find((r) => r.gameType === selectedDashboardGame);

  return (
    <>
      <div className="min-h-screen relative overflow-hidden" style={{ background: '#020617' }}>
        {/* Ambient background — same as Register */}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(52,211,153,0.12) 0%, transparent 70%)' }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 40% at 80% 80%, rgba(139,92,246,0.10) 0%, transparent 70%)' }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 40% 35% at 60% 10%, rgba(56,189,248,0.07) 0%, transparent 70%)' }} />
        {/* Left side decorative character — only on main dashboard */}
        {!showGameDetails && (
        <div className="pointer-events-none absolute left-0 bottom-0 w-[700px] h-screen z-0 hidden xl:block">
          <img
            src="/dashboard-bg-left.png"
            alt=""
            className="w-full h-full object-cover object-left"
            style={{
              maskImage: 'linear-gradient(to right, black 55%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, black 55%, transparent 100%)',
              filter: 'drop-shadow(0 0 60px rgba(251,146,60,0.30)) brightness(1.05)',
            }}
          />
        </div>
        )}
      <Navbar />
      <main className="relative overflow-hidden max-w-[1700px] mx-auto px-3 md:px-8 py-8 md:py-10">
        <div className="space-y-8">

        {/* Concursuri active / viitoare */}
        {!showGameDetails && activeContests.filter(c => c.status === 'waiting' || c.status === 'live').length > 0 && (
          <div className="space-y-3 flex flex-col items-center">
          <div className="w-full max-w-[40rem] space-y-3">
            {activeContests.filter(c => c.status === 'waiting' || c.status === 'live').map((c) => {
              const isLive = c.status === 'live';
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              const tzShort = new Date().toLocaleTimeString('en', { timeZoneName: 'short' }).split(' ').pop() ?? tz;
              const startDate = new Date(c.startAt).toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              const endDate = new Date(c.endAt).toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
              return (
                <div
                  key={c.id}
                  className={`rounded-[28px] border backdrop-blur-xl shadow-lg flex flex-col md:flex-row md:items-center gap-4 p-5 md:p-6 ${
                    isLive
                      ? 'border-red-500/40 bg-red-950/30'
                      : 'border-yellow-500/30 bg-yellow-950/20'
                  }`}
                >
                  {/* Icon + info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={`text-3xl flex-shrink-0 mt-0.5 ${ isLive ? 'animate-pulse' : ''}`}>
                      {isLive ? '🔴' : '🏆'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          isLive ? 'bg-red-600 text-white' : 'bg-yellow-600/80 text-yellow-100'
                        }`}>
                          {isLive ? '● LIVE' : '⏳ În așteptare'}
                        </span>
                        <h3 className="text-white font-bold text-base md:text-lg truncate">{c.name}</h3>
                        {c.gameType && <span className="text-xs text-slate-400">🎮 {c.gameType === 'maze' ? 'Labirinturi' : c.gameType === 'integrame' ? 'Integrame' : c.gameType}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                        <span>🕒 {isLive ? `Până la ${endDate}` : `Start: ${startDate}`} <span className="text-slate-500 text-[10px]">({tzShort})</span></span>
                        {!isLive && <span>🏁 End: {endDate}</span>}
                        <span>👥 {c.registeredCount}{c.maxPlayers ? `/${c.maxPlayers}` : ''} înscriși</span>
                        {c.rounds.length > 0 && (
                          <span>🎯 {c.rounds.length} rondă{c.rounds.length > 1 ? 'e' : ''}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actiuni */}
                  <div className="flex-shrink-0 flex gap-2 items-center">
                    {c.isRegistered ? (
                      <Link
                        href={`/contest/${c.slug}`}
                        className={`px-5 py-2.5 rounded-full font-bold text-sm transition-colors ${
                          isLive
                            ? 'bg-red-600 hover:bg-red-500 text-white'
                            : 'bg-yellow-600 hover:bg-yellow-500 text-white'
                        }`}
                      >
                        {isLive ? '▶ Joacă acum' : '✅ Înscris — Vezi detalii'}
                      </Link>
                    ) : c.isFull ? (
                      <span className="px-5 py-2.5 rounded-full font-bold text-sm bg-gray-700 text-gray-400 cursor-not-allowed">
                        Plin
                      </span>
                    ) : (
                      <button
                        disabled={joiningContest === c.slug}
                        onClick={async () => {
                          setJoiningContest(c.slug);
                          try {
                            await contestsApi.join(c.slug);
                            setActiveContests(prev => prev.map(x =>
                              x.slug === c.slug ? { ...x, isRegistered: true, registeredCount: x.registeredCount + 1 } : x
                            ));
                          } catch { /* ignore */ } finally {
                            setJoiningContest(null);
                          }
                        }}
                        className="px-5 py-2.5 rounded-full font-bold text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors"
                      >
                        {joiningContest === c.slug ? 'Se procesează...' : '🏆 Înscrie-te'}
                      </button>
                    )}
                    {!c.isRegistered && (
                      <Link
                        href={`/contest/${c.slug}`}
                        className="px-3 py-2.5 rounded-full text-sm bg-white/10 hover:bg-white/20 text-white transition-colors"
                      >
                        Detalii
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* Premium Private Room card */}
        {!showGameDetails && (
          <div className="flex flex-col items-center">
            <PremiumRoomCard isPremium={user?.plan === 'premium'} userId={user?.id} />
          </div>
        )}

        {!showGameDetails && (
          <div className="flex flex-col items-center">
            <div className="mb-4 text-center">
              {user?.username && (
                <p className="text-slate-400 text-sm mb-1">Bună, <span className="text-white font-semibold">{user.username}</span>! 👋</p>
              )}
              <h2 className="text-2xl font-bold">Alege jocul</h2>
              <p className="text-[15px] text-slate-300/80 mt-0.5">Intră în detalii pentru jocul dorit, apoi începi în modul grup sau solo.</p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-[40rem]">
              {games.map((game) => {
                const gr = gameRatings.find((r) => r.gameType === game.id);
                const gs = stats.filter((s) => s.gameType === game.id);
                const totalWins = gs.reduce((sum, s) => sum + s.wins, 0);
                const totalMatches = gs.reduce((sum, s) => sum + s.totalMatches, 0);
                return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => handleOpenGameDetails(game.id)}
                  className="text-left rounded-2xl border border-white/10 bg-white/[0.06] hover:bg-white/[0.11] backdrop-blur-xl shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.10)] transition-all p-4"
                >
                  <div className="flex items-center gap-4">
                    {game.id === 'labirinturi' && (
                      <img
                        src="/Labirint.png"
                        alt="Labirinturi"
                        className="w-20 h-20 rounded-xl object-cover shrink-0 border border-white/10"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xl font-bold text-white">{game.emoji} {game.label}</p>
                          <p className="text-sm text-slate-300 mt-1">{game.supportsSolo ? 'Grup + Solo' : 'Grup'}</p>
                        </div>
                        <span className="rounded-full px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 transition-colors">
                          ▶ Joacă acum
                        </span>
                      </div>
                      {gr ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-900/50 text-sky-300 border border-sky-700/40">ELO {gr.rating}</span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-900/50 text-yellow-300 border border-yellow-700/40">XP {gr.xp}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold badge-${gr.league}`}>{gr.league}</span>
                          {totalMatches > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-900/50 text-emerald-300 border border-emerald-700/40">{totalWins}V / {totalMatches - totalWins}Î</span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-emerald-400/80">✨ Începe primul meci!</div>
                      )}
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Play CTA */}
        {showGameDetails && (
        <div className={`${glassCard} p-5 md:p-6`}>
          <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <button
                type="button"
                onClick={handleBackToGameCards}
                className="text-xs font-semibold text-slate-300 hover:text-white mb-2"
              >
                ← Înapoi la lista de jocuri
              </button>
              <h2 className="text-2xl font-bold">Joacă în grup · {selectedDashboardGameDef?.emoji} {selectedDashboardGameDef?.label}</h2>
              <p className="text-[15px] text-slate-300/80 mt-0.5">Alege nivelul și modul de intrare în meci.</p>
              {selectedGameRating && (
                <div className="flex gap-3 mt-2 text-xs font-semibold">
                  <span className="px-2 py-0.5 rounded-full bg-sky-900/50 text-sky-300 border border-sky-700/40">ELO {selectedGameRating.rating}</span>
                  <span className="px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300 border border-yellow-700/40">XP {selectedGameRating.xp}</span>
                  <span className={`px-2 py-0.5 rounded-full badge-${selectedGameRating.league}`}>{selectedGameRating.league}</span>
                </div>
              )}
            </div>
            <Link href={`/games/${selectedGame}/leaderboard?level=${effectiveLevel}`} className="rounded-full px-4 py-2.5 text-[15px] font-semibold bg-white/10 hover:bg-white/20 transition-colors inline-flex items-center gap-2">
              <Trophy size={16} /> Clasament
            </Link>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl px-3 py-4 grid grid-cols-1 md:grid-cols-[minmax(220px,320px)_minmax(220px,320px)] md:justify-center gap-2.5">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Joc selectat</label>
                <div className="relative">
                  <select
                    value={selectedGame}
                    onChange={(e) => setSelectedGame(e.target.value)}
                    disabled
                    className="input rounded-full appearance-none pr-8 text-[15px] bg-slate-800/80 border-slate-600 text-white focus:ring-emerald-500 disabled:opacity-100 disabled:cursor-default"
                  >
                    {games.filter((g) => g.id === selectedDashboardGame).map((g) => (
                      <option key={g.id} value={g.id}>{g.emoji} {g.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Nivel</label>
                <div className="relative">
                  <select
                    value={effectiveLevel}
                    onChange={(e) => {
                      const lvl = parseInt(e.target.value, 10);
                      if (unlockedLevels.has(lvl)) setSelectedLevel(lvl);
                    }}
                      className="input rounded-full appearance-none pr-8 text-[15px] bg-slate-800/80 border-slate-600 text-white focus:ring-emerald-500"
                  >
                    {availableLevels.map((l) => (
                      <option key={l} value={l} disabled={!unlockedLevels.has(l)}>
                        {unlockedLevels.has(l)
                          ? `Nivel ${l} – max ${maxPlayersForLevel(l)} jucători`
                          : `🔒 Nivel ${l} – ${levelWins(l - 1)}/${winsNeeded(l)} victorii la N${l - 1}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                {nextLockedLevel && (
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Lock size={10} />
                    Nivel {nextLockedLevel} se deblochează după {winsNeeded(nextLockedLevel)} victorii la Nivel {nextLockedLevel - 1}
                    <span className="text-violet-300 font-semibold">({levelWins(nextLockedLevel - 1)}/{winsNeeded(nextLockedLevel)})</span>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
              <div className="rounded-2xl border border-slate-700 bg-slate-800/50 px-3.5 py-4 flex flex-col items-center justify-center">
                <span className="text-[11px] uppercase tracking-wide text-violet-200/80 font-semibold mb-2">Joc normal</span>
                <span className="text-[15px] text-slate-300/80 mb-2 text-center">Intri rapid într-un meci cu alți jucători.</span>
                <button onClick={() => { setShowAiThemes(false); setShowNormalConfirm(true); }} disabled={loading || aiLoading} className="inline-flex items-center justify-center gap-2 min-w-[190px] rounded-full px-8 py-3 text-[15px] font-semibold bg-violet-300 hover:bg-violet-200 text-slate-950 transition-colors disabled:opacity-70 shadow-md shadow-violet-400/30">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creare meci...</>
                    : <><Play size={16} fill="currentColor" /> Joacă normal</>}
                </button>
                <span className="text-[15px] text-slate-400 font-medium mt-2 text-center">
                  🎯 Nivel {effectiveLevel} · max {maxPlayersForLevel(effectiveLevel)} jucători
                </span>
              </div>

              <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3.5 py-4 flex flex-col items-center justify-center">
                <span className="text-[11px] uppercase tracking-wide text-amber-200/90 font-semibold mb-2">Cu AI</span>
                <span className="text-[15px] text-amber-100/85 mb-2 text-center">
                  {selectedGame === 'integrame'
                    ? 'Mai întâi alegi tema, apoi pornești jocul.'
                    : 'Joacă împotriva unui bot AI.'}
                </span>
                <button
                  onClick={() => {
                    if (selectedGame === 'integrame' && !showAiThemes) {
                      setShowAiThemes(true);
                      return;
                    }
                    setShowAiConfirm(true);
                  }}
                  disabled={loading || aiLoading}
                  className="inline-flex items-center justify-center gap-2 min-w-[190px] rounded-full px-8 py-3 text-[15px] font-semibold bg-amber-300 hover:bg-amber-200 text-slate-900 transition-colors disabled:opacity-70 shadow-md shadow-amber-300/30"
                >
                  {aiLoading
                    ? <><span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" /> Se generează...</>
                    : <>{selectedGame === 'integrame' && showAiThemes ? '🚀 Pornește jocul' : '🚀 Pornește jocul'}</>}
                </button>

                {selectedGame === 'integrame' && showAiThemes && (
                  <div className="mt-3 w-full rounded-xl border border-amber-200/20 bg-black/10 p-2">
                    <span className="text-[15px] text-amber-100/90 font-semibold">🎯 Alege o temă:</span>
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                      {Object.entries(AI_THEME_LABELS).map(([key, label]) => (
                        <button key={key} onClick={() => setAiTheme(key)} className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${aiTheme === key ? 'bg-amber-200 border-amber-100 text-slate-900 font-semibold' : 'bg-white/10 border-white/20 text-amber-50 hover:border-amber-200/60'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Play error */}
          {playError && (
            <div className="mt-3 flex items-center gap-2 bg-red-950 border border-red-500/40 rounded-xl px-4 py-3 text-red-300 text-sm">
              <X size={16} className="shrink-0 text-red-400" />
              {playError}
              <button onClick={() => setPlayError('')} className="ml-auto text-red-500 hover:text-red-300"><X size={14} /></button>
            </div>
          )}

          {/* Invite URL box */}
          {inviteUrl && (
            <div className="mt-4 flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl px-4 py-3">
              <Link2 size={16} className="text-violet-400 shrink-0" />
              <span className="flex-1 text-sm text-slate-300 truncate font-mono">{inviteUrl}</span>
              {inviteSecondsLeft !== null && (
                <span className="text-xs font-semibold text-amber-200 shrink-0">⏳ {formatSeconds(inviteSecondsLeft)}</span>
              )}
              <button
                onClick={copyInviteUrl}
                className="text-xs py-1 px-3 gap-1 shrink-0 rounded-lg bg-amber-300 text-slate-900 hover:bg-amber-200 font-semibold"
              >
                {copied ? <><Check size={13} className="text-green-400" /> Copiat!</> : <><Copy size={13} /> Copiază</>}
              </button>
              <button
                onClick={() => {
                  setInviteUrl('');
                  setInviteExpiresAt(null);
                  setInviteSecondsLeft(null);
                }}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
        )}

        {/* Solo */}
        {showGameDetails && (
        <div className={`${glassCard} p-6 md:p-8`}>
          <div className="mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <BookOpen size={20} className="text-purple-400" />
                Solo · {selectedDashboardGameDef?.emoji} {selectedDashboardGameDef?.label}
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">
                Progres și niveluri solo pentru jocul selectat
              </p>
            </div>
          </div>

          {soloGameInView === 'integrame' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {(integrameSoloLevels.length > 0 ? integrameSoloLevels : [1,2,3,4,5].map((l) => ({ level: l, displayName: `Nivel ${l}`, winsToUnlock: 3, gamesPerLevel: 3, maxPlayers: 2 }))).map((cfg) => {
              const lvl = cfg.level;
              const gamesCount = cfg.gamesPerLevel ?? 3;
              const prevCfg = integrameSoloLevels.find((c) => c.level === lvl - 1);
              const prevGamesCount = prevCfg?.gamesPerLevel ?? 3;
              const firstLevel = integrameSoloLevels[0]?.level ?? 1;
              const unlocked = !soloDashMounted ? lvl === firstLevel : isUnlocked(lvl, 0, prevGamesCount);
              const thisLevelCompleted = soloDashMounted
                ? Array.from({ length: gamesCount }, (_, i) => i).filter((gi) => isCompleted(lvl, gi)).length
                : 0;

              if (!unlocked) {
                return (
                  <div
                    key={lvl}
                    className={`${lockedLevelCard} p-3 py-4 md:p-4 md:py-6 text-center`}
                  >
                    <div className="text-[28px] font-black text-slate-500">{lvl}</div>
                    <div className="text-[15px] text-slate-500 mt-1">{cfg.displayName || `Nivel ${lvl}`}</div>
                    <div className="text-[10px] text-slate-600 mt-1">{gamesCount} jocuri</div>
                    <div className="mt-1.5 flex items-center gap-1 text-slate-600 text-[10px] font-semibold">
                      <Lock size={10} /> Blocat
                    </div>
                    <button
                      type="button"
                      disabled
                      className={soloDisabledBtn}
                    >
                      <Lock size={14} className="text-slate-500" />
                      Dezactivat
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={lvl}
                  className={`${levelCard} p-3 py-4 md:p-4 md:py-6 text-center group`}
                >
                  <div className="text-[28px] font-black text-white group-hover:text-violet-400 transition-colors">
                    {lvl}
                  </div>
                  <div className="text-[15px] text-slate-300 mt-1">
                    {cfg.displayName || `Nivel ${lvl}`}
                  </div>
                  <div className="flex justify-center gap-1 mt-2">
                    {Array.from({ length: gamesCount }, (_, gi) => (
                      <Star
                        key={gi}
                        size={12}
                        className={soloDashMounted && isCompleted(lvl, gi) ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400'}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {thisLevelCompleted} / {gamesCount} jocuri
                  </div>
                  <Link
                    href="/integrame"
                    className={soloPlayBtn}
                  >
                    Joacă
                  </Link>
                </div>
              );
            })}
          </div>
          ) : soloGameInView === 'labirinturi' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {(mazeSoloLevels.length > 0 ? mazeSoloLevels : [1, 2, 3, 4, 5].map((level) => ({ level, displayName: `Nivel ${level}`, winsToUnlock: 5, gamesPerLevel: 4, maxPlayers: 2 }))).map((cfg) => {
                const lvl = cfg.level;
                const configuredGamesCount = cfg.gamesPerLevel ?? 4;
                const playableGamesCount = configuredGamesCount;
                const firstMazeLevel = mazeSoloLevels[0]?.level ?? 1;
                const prevCfg = mazeSoloLevels.find((entry) => entry.level === lvl - 1);
                const prevPlayableGamesCount = prevCfg?.gamesPerLevel ?? 4;
                const unlocked = lvl === firstMazeLevel || Array.from({ length: prevPlayableGamesCount }, (_v, gameIdx) => mazeCompleted.has(`${lvl - 1}-${gameIdx}`)).every(Boolean);
                const levelDone = Array.from({ length: playableGamesCount }, (_v, gameIdx) => mazeCompleted.has(`${lvl}-${gameIdx}`)).every(Boolean);
                const completedGamesCount = Array.from({ length: playableGamesCount }, (_v, gameIdx) => mazeCompleted.has(`${lvl}-${gameIdx}`)).filter(Boolean).length;

                if (!unlocked) {
                  return (
                    <div
                      key={lvl}
                      className={`${lockedLevelCard} p-3 py-4 md:p-4 md:py-6 text-center`}
                    >
                      <div className="text-[28px] font-black text-slate-500">{lvl}</div>
                      <div className="text-[15px] text-slate-500 mt-1">{cfg.displayName || `Nivel ${lvl}`}</div>
                      <div className="text-[10px] text-slate-600 mt-1">{configuredGamesCount} jocuri</div>
                      <div className="text-[10px] mt-1.5 text-slate-600 font-semibold">🔒 Blocat</div>
                      <button
                        type="button"
                        disabled
                        className={soloDisabledBtn}
                      >
                        <Lock size={14} className="text-slate-500" />
                        Dezactivat
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={lvl}
                    className={`${levelCard} p-3 py-4 md:p-4 md:py-6 text-center group`}
                  >
                    <div className="text-[28px] font-black text-white group-hover:text-emerald-400 transition-colors">
                      {lvl}
                    </div>
                    <div className="text-[15px] text-slate-300 mt-1">
                      {cfg.displayName || `Nivel ${lvl}`}
                    </div>
                    <div className="flex justify-center gap-1 mt-2">
                      {Array.from({ length: playableGamesCount }, (_v, gameIdx) => (
                        <Star
                          key={gameIdx}
                          size={12}
                          className={mazeCompleted.has(`${lvl}-${gameIdx}`) ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400'}
                        />
                      ))}
                    </div>
                    <div className={`text-[10px] mt-1.5 font-semibold ${levelDone ? 'text-emerald-600' : 'text-emerald-500'}`}>
                      {completedGamesCount} / {configuredGamesCount} jocuri
                    </div>
                    <Link
                      href="/labirinturi"
                      className={soloPlayBtn}
                    >
                      Joacă
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-5 text-sm text-violet-100/90">
              Modul solo pentru <span className="font-semibold text-white">{games.find((g) => g.id === soloGameInView)?.label}</span> nu este încă disponibil.
              Când va fi activat, îl vei putea porni direct din acest card.
            </div>
          )}
        </div>
        )}

        {/* Meciuri recente per joc */}
        {showGameDetails && (() => {
          const gameMatches = recentMatches.filter((m: any) => {
            const gt = m.gameType === 'maze' ? 'labirinturi' : m.gameType;
            return gt === selectedDashboardGame;
          });
          if (gameMatches.length === 0) return null;
          return (
            <div className={`${glassCard} p-5 md:p-6`}>
              <h2 className="text-lg font-bold mb-4">Meciuri recente · {selectedDashboardGameDef?.emoji} {selectedDashboardGameDef?.label}</h2>
              <div className="space-y-2">
                {gameMatches.slice(0, 5).map((m: any) => {
                  const me = m.players?.find((p: any) => p.userId === user?.id);
                  const myPos = me?.position;
                  const total = m.players?.length ?? 0;
                  const isWin = myPos === 1;
                  const isLoss = myPos === total && total > 1;
                  return (
                    <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-white/10 last:border-0 gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-400">Nivel {m.level}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          isWin ? 'bg-emerald-500/20 text-emerald-300' :
                          isLoss ? 'bg-red-500/20 text-red-300' :
                          'bg-slate-700 text-slate-300'
                        }`}>
                          {isWin ? 'Victorie' : isLoss ? 'Înfrângere' : myPos ? `Locul ${myPos}` : m.status}
                        </span>
                        {me?.eloChange !== undefined && me.eloChange !== 0 && (
                          <span className={`text-[11px] font-semibold ${ me.eloChange > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {me.eloChange > 0 ? '+' : ''}{me.eloChange} ELO
                          </span>
                        )}
                        {me?.xpGained > 0 && (
                          <span className="text-[11px] font-semibold text-yellow-400">+{me.xpGained} XP</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500">{m.players?.length} jucători</span>
                        <Link href={`/games/${m.gameType}/result?matchId=${m.id}`} className="text-[11px] py-1 px-2.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors">
                          Rezultate
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        </div>
      </main>

      {showNormalConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[40rem] rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Alege cum vrei să joci</h3>
            <p className="mt-2 text-sm text-slate-300">Poți intra random sau poți genera un link pentru prieteni (expiră în 5 minute).</p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setShowNormalConfirm(false);
                  handlePlay();
                }}
                disabled={loading || aiLoading}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-violet-300 text-slate-950 hover:bg-violet-200 transition-colors disabled:opacity-70"
              >
                Joc random
              </button>
              <button
                onClick={() => {
                  setShowNormalConfirm(false);
                  handleInvite();
                }}
                disabled={inviteLoading}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-amber-300 text-slate-950 hover:bg-amber-200 transition-colors disabled:opacity-70"
              >
                {inviteLoading ? 'Se generează...' : 'Joc cu prietenii'}
              </button>
            </div>
            <button
              onClick={() => setShowNormalConfirm(false)}
              className="mt-3 text-xs text-slate-400 hover:text-slate-200"
            >
              Închide
            </button>
          </div>
        </div>
      )}

      {showAiConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[40rem] rounded-2xl border border-amber-500/30 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Cum vrei să joci puzzle-ul generat?</h3>
            <p className="mt-2 text-sm text-amber-100/85">
              Tema selectată: <span className="font-semibold text-amber-200">{AI_THEME_LABELS[aiTheme]}</span>
            </p>
            <p className="mt-1 text-xs text-amber-100/75">
              Random = matchmaking rapid · Cu prietenii = link de invitație
            </p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setShowAiConfirm(false);
                  handlePlayAI();
                }}
                disabled={loading || aiLoading}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-amber-300 text-slate-950 hover:bg-amber-200 transition-colors disabled:opacity-70"
              >
                Random
              </button>
              <button
                onClick={() => {
                  setShowAiConfirm(false);
                  handleInvite({ isAI: true, aiTheme });
                }}
                disabled={aiInviteLoading}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-violet-300 text-slate-950 hover:bg-violet-200 transition-colors disabled:opacity-70"
              >
                {aiInviteLoading ? 'Se generează...' : 'Cu prietenii'}
              </button>
            </div>
            <button
              onClick={() => setShowAiConfirm(false)}
              className="mt-3 text-xs text-slate-400 hover:text-slate-200"
            >
              Închide
            </button>
          </div>
        </div>
      )}

      {showRandomAccept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-[40rem] rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Ai găsit un meci random</h3>
            <p className="mt-2 text-sm text-slate-300">Vrei să intri în acest joc?</p>
            <p className="mt-2 text-xs font-semibold text-amber-200">Timp rămas: {randomAcceptSecondsLeft ?? RANDOM_ACCEPT_TTL_SECONDS}s</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={declineRandomMatch}
                disabled={randomDecisionLoading}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-white/10 border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-70"
              >
                Nu accept
              </button>
              <button
                onClick={acceptRandomMatch}
                disabled={randomDecisionLoading}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-violet-300 text-slate-950 hover:bg-violet-200 transition-colors disabled:opacity-70"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
