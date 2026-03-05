'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Play, ChevronDown, BookOpen, Star, Link2, Copy, Check, X, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { matchesApi, invitesApi, statsApi } from '@/lib/api';
import { Match, GameLevel, MAX_PLAYERS_PER_LEVEL, UserGameStats } from '@integrame/shared';
import Navbar from '@/components/Navbar';
import { isCompleted } from '@/store/gameProgress';
import { useGamesCatalog } from '@/games/useGamesCatalog';
import { hydrateMazeProgressFromServer } from '@/store/mazeSoloProgress';

const INVITE_TTL_SECONDS = 300;
const RANDOM_ACCEPT_TTL_SECONDS = 10;

export default function DashboardPage() {
  const router = useRouter();
  const games = useGamesCatalog();
  const { user, fetchMe, token, _hasHydrated } = useAuthStore();
  const [selectedGame, setSelectedGame] = useState('integrame');
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>(1);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
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
  const [selectedSoloGame, setSelectedSoloGame] = useState('integrame');
  const [mazeCompleted, setMazeCompleted] = useState<Set<string>>(new Set());

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
    matchesApi.getHistory().then((r) => setRecentMatches(r.data)).catch(() => {});
    statsApi.getMyStats().then((r) => setStats(r.data)).catch(() => {});
  }, [_hasHydrated, token]);

  useEffect(() => {
    if (games.length === 0) return;
    const exists = games.some((game) => game.id === selectedGame);
    if (!exists) {
      setSelectedGame(games[0]?.id || 'integrame');
    }
  }, [games, selectedGame]);

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

  if (!_hasHydrated) return <div className="min-h-screen" style={{ backgroundColor: '#210340' }} />;

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

  if (!user) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#210340' }}><div className="w-8 h-8 border-2 border-violet-300 border-t-transparent rounded-full animate-spin" /></div>;

  // Level unlock logic: each level requires 5 wins at the previous level
  const WINS_TO_UNLOCK = 5;
  const levelWins = (lvl: number) =>
    stats.find((s) => s.gameType === selectedGame && s.level === lvl)?.wins ?? 0;
  const unlockedLevels = new Set<number>([1]);
  for (let lvl = 2; lvl <= 5; lvl++) {
    if (unlockedLevels.has(lvl - 1) && levelWins(lvl - 1) >= WINS_TO_UNLOCK) {
      unlockedLevels.add(lvl);
    } else break;
  }
  const effectiveLevel: GameLevel = unlockedLevels.has(selectedLevel) ? selectedLevel : 1;
  // Next level that is locked (to show requirement hint)
  const nextLockedLevel = ([2, 3, 4, 5] as GameLevel[]).find((lvl) => !unlockedLevels.has(lvl));
  const glassCard = 'rounded-[36px] border border-white/25 bg-white/12 backdrop-blur-xl shadow-[0_20px_60px_rgba(46,16,101,0.45)]';
  const levelCard = 'rounded-[22px] border border-white bg-white hover:bg-white transition-all hover:scale-[1.02] min-h-[140px] md:min-h-[160px] flex flex-col items-center justify-center shadow-lg shadow-violet-950/20';
  const lockedLevelCard = 'rounded-[22px] border border-white/40 bg-white/40 opacity-75 min-h-[120px] md:min-h-[130px] flex flex-col items-center justify-center';
  const soloActionBtnBase = 'mt-4 md:mt-8 mx-auto w-full max-w-[170px] px-4 md:px-6 py-2.5 rounded-full text-[15px] font-semibold inline-flex items-center justify-center gap-2';
  const soloPlayBtn = `${soloActionBtnBase} bg-violet-500 text-white hover:bg-violet-400`;
  const soloDisabledBtn = `${soloActionBtnBase} bg-transparent border border-white text-white cursor-not-allowed`;

  return (
    <>
      <div className="min-h-screen" style={{ backgroundColor: '#210340' }}>
      <Navbar />
      <main className="relative overflow-hidden max-w-[1700px] mx-auto px-3 md:px-8 py-8 md:py-10">
        <div className="space-y-8">

        {/* Play CTA */}
        <div className={`${glassCard} p-5 md:p-6`}>
          <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold">Joacă în grup</h2>
              <p className="text-[15px] text-slate-300/80 mt-0.5">Pasul 1: alege jocul și nivelul. Pasul 2: alege cum vrei să joci.</p>
            </div>
            <Link href={`/games/${selectedGame}/leaderboard?level=${effectiveLevel}`} className="rounded-full px-4 py-2.5 text-[15px] font-semibold bg-white/10 hover:bg-white/20 transition-colors inline-flex items-center gap-2">
              <Trophy size={16} /> Clasament
            </Link>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl px-3 py-4 grid grid-cols-1 md:grid-cols-[minmax(220px,320px)_minmax(220px,320px)] md:justify-center gap-2.5">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Joc</label>
                <div className="relative">
                  <select
                    value={selectedGame}
                    onChange={(e) => setSelectedGame(e.target.value)}
                      className="input rounded-full appearance-none pr-8 text-[15px] bg-[#2a0a4a]/80 border-violet-300/30 focus:ring-violet-400"
                  >
                    {games.map((g) => (
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
                      const lvl = parseInt(e.target.value) as GameLevel;
                      if (unlockedLevels.has(lvl)) setSelectedLevel(lvl);
                    }}
                      className="input rounded-full appearance-none pr-8 text-[15px] bg-[#2a0a4a]/80 border-violet-300/30 focus:ring-violet-400"
                  >
                    {([1, 2, 3, 4, 5] as GameLevel[]).map((l) => (
                      <option key={l} value={l} disabled={!unlockedLevels.has(l)}>
                        {unlockedLevels.has(l)
                          ? `Nivel ${l} – max ${MAX_PLAYERS_PER_LEVEL[l]} jucători`
                          : `🔒 Nivel ${l} – ${levelWins(l - 1)}/${WINS_TO_UNLOCK} victorii N${l - 1}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                {nextLockedLevel && (
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Lock size={10} />
                    Nivel {nextLockedLevel} se deblochează după {WINS_TO_UNLOCK} victorii la Nivel {nextLockedLevel - 1}
                    <span className="text-violet-300 font-semibold">({levelWins(nextLockedLevel - 1)}/{WINS_TO_UNLOCK})</span>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
              <div className="rounded-2xl border border-white/15 bg-white/5 px-3.5 py-4 flex flex-col items-center justify-center">
                <span className="text-[11px] uppercase tracking-wide text-violet-200/80 font-semibold mb-2">Joc normal</span>
                <span className="text-[15px] text-slate-300/80 mb-2 text-center">Intri rapid într-un meci cu alți jucători.</span>
                <button onClick={() => { setShowAiThemes(false); setShowNormalConfirm(true); }} disabled={loading || aiLoading} className="inline-flex items-center justify-center gap-2 min-w-[190px] rounded-full px-8 py-3 text-[15px] font-semibold bg-violet-300 hover:bg-violet-200 text-slate-950 transition-colors disabled:opacity-70 shadow-md shadow-violet-400/30">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creare meci...</>
                    : <><Play size={16} fill="currentColor" /> Joacă normal</>}
                </button>
                <span className="text-[15px] text-slate-400 font-medium mt-2 text-center">
                  🎯 Nivel {effectiveLevel} · max {MAX_PLAYERS_PER_LEVEL[effectiveLevel]} jucători
                </span>
              </div>

              <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3.5 py-4 flex flex-col items-center justify-center">
                <span className="text-[11px] uppercase tracking-wide text-amber-200/90 font-semibold mb-2">Cu AI</span>
                <span className="text-[15px] text-amber-100/85 mb-2 text-center">Mai întâi alegi tema, apoi pornești jocul.</span>
                <button
                  onClick={() => {
                    if (!showAiThemes) {
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
                    : <>{showAiThemes ? '🚀 Pornește jocul' : '🎲 Generează joc'}</>}
                </button>

                {showAiThemes && (
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

        {/* Solo */}
        <div className={`${glassCard} p-6 md:p-8`}>
          <div className="mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <BookOpen size={20} className="text-purple-400" />
                Solo
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">
                Alege jocul pe care vrei să îl joci singur
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {games.map((game) => (
              <button
                key={game.id}
                onClick={() => setSelectedSoloGame(game.id)}
                className={selectedSoloGame === game.id ? 'text-[15px] rounded-full px-7 py-2.5 bg-amber-300 text-slate-950 font-semibold' : 'text-[15px] rounded-full px-7 py-2.5 bg-white/10 border border-white/20 text-slate-100 hover:bg-white/15 font-semibold'}
              >
                {game.emoji} {game.label}
                {!game.supportsSolo && <span className="text-[10px] opacity-70 ml-1">(în curând)</span>}
              </button>
            ))}
          </div>

          {selectedSoloGame === 'integrame' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((lvl) => {
              const unlocked = lvl === 1 || [0, 1, 2].every((gi) => isCompleted(lvl - 1, gi));

              if (!unlocked) {
                return (
                  <div
                    key={lvl}
                    className={`${lockedLevelCard} p-3 py-4 md:p-4 md:py-6 text-center`}
                  >
                    <div className="text-[28px] font-black text-[#15141a]">{lvl}</div>
                    <div className="text-[15px] text-[#15141a] mt-1">Nivel {lvl}</div>
                    <div className="mt-1.5 flex items-center gap-1 text-slate-600 text-[10px] font-semibold">
                      <Lock size={10} /> Blocat
                    </div>
                    <button
                      type="button"
                      disabled
                      className={soloDisabledBtn}
                    >
                      <Lock size={14} className="text-white" />
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
                  <div className="text-[28px] font-black text-[#15141a] group-hover:text-purple-600 transition-colors">
                    {lvl}
                  </div>
                  <div className="text-[15px] text-[#15141a] mt-1">
                    Nivel {lvl}
                  </div>
                  <div className="flex justify-center gap-1 mt-2">
                    {[0, 1, 2].map((gi) => (
                      <Star
                        key={gi}
                        size={12}
                        className={isCompleted(lvl, gi) ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400'}
                      />
                    ))}
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
          ) : selectedSoloGame === 'labirinturi' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((lvl) => {
                const unlocked = lvl === 1 || [0, 1, 2, 3].every((gameIdx) => mazeCompleted.has(`${lvl - 1}-${gameIdx}`));
                const levelDone = [0, 1, 2, 3].every((gameIdx) => mazeCompleted.has(`${lvl}-${gameIdx}`));

                if (!unlocked) {
                  return (
                    <div
                      key={lvl}
                      className={`${lockedLevelCard} p-3 py-4 md:p-4 md:py-6 text-center`}
                    >
                      <div className="text-[28px] font-black text-[#15141a]">{lvl}</div>
                      <div className="text-[15px] text-[#15141a] mt-1">Nivel {lvl}</div>
                      <div className="text-[10px] mt-1.5 text-slate-600 font-semibold">🔒 Blocat</div>
                      <button
                        type="button"
                        disabled
                        className={soloDisabledBtn}
                      >
                        <Lock size={14} className="text-white" />
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
                    <div className="text-[28px] font-black text-[#15141a] group-hover:text-emerald-600 transition-colors">
                      {lvl}
                    </div>
                    <div className="text-[15px] text-[#15141a] mt-1">
                      Nivel {lvl}
                    </div>
                    <div className="flex justify-center gap-1 mt-2">
                      {[0, 1, 2, 3].map((gameIdx) => (
                        <Star
                          key={gameIdx}
                          size={12}
                          className={mazeCompleted.has(`${lvl}-${gameIdx}`) ? 'text-yellow-500 fill-yellow-500' : 'text-slate-400'}
                        />
                      ))}
                    </div>
                    <div className={`text-[10px] mt-1.5 font-semibold ${levelDone ? 'text-emerald-600' : 'text-emerald-500'}`}>
                      {levelDone ? '✅ Completat' : '🌀 Solo'}
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
              Modul solo pentru <span className="font-semibold text-white">{games.find((g) => g.id === selectedSoloGame)?.label}</span> nu este încă disponibil.
              Când va fi activat, îl vei putea porni direct din acest card.
            </div>
          )}
        </div>

        {/* Recent matches */}
        {recentMatches.length > 0 && (
          <div className={`${glassCard} p-6 md:p-8`}>
            <h2 className="text-xl font-bold mb-4">Meciuri recente</h2>
            <div className="space-y-3">
              {recentMatches.slice(0, 5).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between py-3 border-b border-white/10 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm capitalize">{m.gameType}</span>
                    <span className="badge bg-white/10 text-slate-200">Nivel {m.level}</span>
                    <span className={`badge ${m.status === 'finished' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-400/20 text-amber-200'}`}>
                      {m.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm">{m.players?.length} jucători</span>
                    <Link href={`/games/${m.gameType}/result?matchId=${m.id}`} className="text-xs py-1 px-3 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20">
                      Rezultate
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </main>

      {showNormalConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-[#1d0838] p-5 shadow-2xl">
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
          <div className="w-full max-w-md rounded-2xl border border-amber-200/30 bg-[#2a1530] p-5 shadow-2xl">
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
          <div className="w-full max-w-md rounded-2xl border border-violet-200/30 bg-[#1d0838] p-5 shadow-2xl">
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
