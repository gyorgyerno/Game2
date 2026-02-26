'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Zap, TrendingUp, Play, UserPlus, ChevronDown, BookOpen, Star, Link2, Copy, Check, X, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { matchesApi, invitesApi, statsApi, aiApi } from '@/lib/api';
import { Match, GameLevel, MAX_PLAYERS_PER_LEVEL, UserGameStats } from '@integrame/shared';
import Navbar from '@/components/Navbar';
import { isCompleted } from '@/store/gameProgress';

const GAMES = [
  { id: 'integrame', name: 'Integrame', emoji: '📝' },
  { id: 'slogane', name: 'Slogane', emoji: '💬' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, fetchMe, token, _hasHydrated } = useAuthStore();
  const [selectedGame, setSelectedGame] = useState('integrame');
  const [selectedLevel, setSelectedLevel] = useState<GameLevel>(1);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [playError, setPlayError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<UserGameStats[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTheme, setAiTheme] = useState('general');

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

  if (!_hasHydrated) return <div className="min-h-screen bg-slate-950" />;

  async function handlePlay() {
    setLoading(true);
    setPlayError('');
    try {
      const { data } = await matchesApi.findOrCreate(selectedGame, effectiveLevel, false);
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

  async function handleInvite() {
    setInviteLoading(true);
    try {
      const { data } = await invitesApi.create({ gameType: selectedGame, level: effectiveLevel });
      setInviteUrl(data.inviteUrl);
      setCopied(false);
    } catch {
      alert('Eroare la generarea invitației');
    } finally {
      setInviteLoading(false);
    }
  }

  function copyInviteUrl() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  if (!user) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  const leagueLabel = user.league?.charAt(0).toUpperCase() + user.league?.slice(1);

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
  // Clamp selectedLevel to highest unlocked if it became locked (e.g. after game change)
  const maxUnlocked = Math.max(...Array.from(unlockedLevels)) as GameLevel;
  const effectiveLevel: GameLevel = unlockedLevels.has(selectedLevel) ? selectedLevel : 1;
  // Next level that is locked (to show requirement hint)
  const nextLockedLevel = ([2, 3, 4, 5] as GameLevel[]).find((lvl) => !unlockedLevels.has(lvl));

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Profile hero */}
        <div className="card flex flex-col md:flex-row items-start md:items-center gap-6">
          <img
            src={user.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${user.username}`}
            alt={user.username}
            className="w-20 h-20 rounded-2xl border-2 border-brand-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{user.username}</h1>
              <span className={`badge-${user.league}`}>{leagueLabel}</span>
            </div>
            <div className="flex gap-6 mt-3 flex-wrap">
              <div>
                <div className="text-slate-400 text-xs">Rating ELO</div>
                <div className="text-xl font-bold text-brand-400">{user.rating}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">Total XP</div>
                <div className="text-xl font-bold text-yellow-400">{user.xp}</div>
              </div>
            </div>
          </div>
          <Link href="/profile" className="btn-outline text-sm">
            <TrendingUp size={14} /> Profilul meu
          </Link>
        </div>

        {/* Play CTA */}
        <div className="card">
          <h2 className="text-lg font-bold mb-4">Joacă în grup</h2>
          <div className="flex flex-wrap gap-4 items-end">
            {/* Game selector */}
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-slate-400 mb-1">Joc</label>
              <div className="relative">
                <select
                  value={selectedGame}
                  onChange={(e) => setSelectedGame(e.target.value)}
                  className="input appearance-none pr-8"
                >
                  {GAMES.map((g) => (
                    <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            {/* Level selector */}
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs text-slate-400 mb-1">Nivel</label>
              <div className="relative">
                <select
                  value={effectiveLevel}
                  onChange={(e) => {
                    const lvl = parseInt(e.target.value) as GameLevel;
                    if (unlockedLevels.has(lvl)) setSelectedLevel(lvl);
                  }}
                  className="input appearance-none pr-8"
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
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Lock size={10} />
                  Nivel {nextLockedLevel} se deblochează după {WINS_TO_UNLOCK} victorii la Nivel {nextLockedLevel - 1}
                  <span className="text-brand-400 font-semibold">({levelWins(nextLockedLevel - 1)}/{WINS_TO_UNLOCK})</span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <button onClick={handlePlay} disabled={loading || aiLoading} className="btn-primary gap-2 min-w-[130px]">
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creare meci...</>
                  : <><Play size={16} fill="currentColor" /> Joacă</>}
              </button>
              <span className="text-xs text-slate-400 font-medium">
                🎯 Nivel {effectiveLevel} · max {MAX_PLAYERS_PER_LEVEL[effectiveLevel]} jucători
              </span>
            </div>
            <button onClick={handlePlayAI} disabled={loading || aiLoading} className="btn-secondary gap-2 min-w-[130px] border-violet-500/50 hover:border-violet-400">
              {aiLoading
                ? <><span className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /> Se generează...</>
                : <>🤖 Puzzle AI</>}
            </button>
            <button onClick={handleInvite} disabled={inviteLoading} className="btn-secondary gap-2">
              <Link2 size={16} />
              {inviteLoading ? 'Se generează...' : 'Invită la Duel'}
            </button>
            <Link href={`/games/${selectedGame}/leaderboard?level=${effectiveLevel}`} className="btn-secondary">
              <Trophy size={16} /> Clasament
            </Link>
          </div>

          {/* AI Theme selector */}
          <div className="w-full mt-3 flex items-center gap-3 p-3 bg-violet-950/40 border border-violet-500/20 rounded-xl">
            <span className="text-xs text-violet-400 font-semibold shrink-0">🤖 Temă AI:</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(AI_THEME_LABELS).map(([key, label]) => (
                <button key={key} onClick={() => setAiTheme(key)} className={`text-xs px-3 py-1 rounded-full border transition-all ${aiTheme === key ? 'bg-violet-600 border-violet-500 text-white font-semibold' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-violet-500/50'}`}>
                  {label}
                </button>
              ))}
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
            <div className="mt-4 flex items-center gap-2 bg-slate-800 border border-violet-500/40 rounded-xl px-4 py-3">
              <Link2 size={16} className="text-violet-400 shrink-0" />
              <span className="flex-1 text-sm text-slate-300 truncate font-mono">{inviteUrl}</span>
              <button
                onClick={copyInviteUrl}
                className="btn-secondary text-xs py-1 px-3 gap-1 shrink-0"
              >
                {copied ? <><Check size={13} className="text-green-400" /> Copiat!</> : <><Copy size={13} /> Copiază</>}
              </button>
              <button
                onClick={() => setInviteUrl('')}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Solo Integrame */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <BookOpen size={20} className="text-purple-400" />
                Integrame Solo
              </h2>
              <p className="text-slate-400 text-sm mt-0.5">
                Rezolvă puzzle-uri de cuvinte încrucișate singur, la propriul ritm
              </p>
            </div>
            <Link
              href="/integrame"
              className="btn-primary gap-2 text-sm"
            >
              <Play size={14} fill="currentColor" />
              Joacă Solo
            </Link>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((lvl) => {
              const completedCount = [0, 1, 2].filter((gi) => isCompleted(lvl, gi)).length;
              return (
                <Link
                  key={lvl}
                  href="/integrame"
                  className="bg-slate-800 hover:bg-slate-700 rounded-xl p-4 py-6 text-center transition-all hover:scale-105 group min-h-[110px] flex flex-col items-center justify-center"
                >
                  <div className="text-xl font-black text-slate-500 group-hover:text-purple-400 transition-colors">
                    {lvl}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Nivel {lvl}
                  </div>
                  <div className="flex justify-center gap-0.5 mt-1.5">
                    {[0, 1, 2].map((gi) => (
                      <Star
                        key={gi}
                        size={8}
                        className={isCompleted(lvl, gi) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}
                      />
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent matches */}
        {recentMatches.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-bold mb-4">Meciuri recente</h2>
            <div className="space-y-3">
              {recentMatches.slice(0, 5).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm capitalize">{m.gameType}</span>
                    <span className="badge bg-slate-800 text-slate-300">Nivel {m.level}</span>
                    <span className={`badge ${m.status === 'finished' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                      {m.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm">{m.players?.length} jucători</span>
                    <Link href={`/games/${m.gameType}/result?matchId=${m.id}`} className="btn-outline text-xs py-1 px-3">
                      Rezultate
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
