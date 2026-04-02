'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { statsApi, usersApi, api } from '@/lib/api';
import { UserGameStats } from '@integrame/shared';
import Navbar from '@/components/Navbar';
import { useGamesCatalog } from '@/games/useGamesCatalog';

export default function ProfilePage() {
  const router = useRouter();
  const games = useGamesCatalog();
  const { user, token, fetchMe, _hasHydrated } = useAuthStore();
  const [stats, setStats] = useState<UserGameStats[]>([]);
  const [selectedGame, setSelectedGame] = useState('integrame');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mazeSoloCompleted, setMazeSoloCompleted] = useState<number[]>([]);
  const [mazeSoloBestScores, setMazeSoloBestScores] = useState<Record<number, number>>({});
  const [mazeSoloLevels, setMazeSoloLevels] = useState<{ level: number; displayName: string; gamesPerLevel: number }[]>([]);
  const [integrameSoloGames, setIntegrameSoloGames] = useState<{ level: number; gameIndex: number }[]>([]);
  const [integrameSoloLevels, setIntegrameSoloLevels] = useState<{ level: number; displayName: string; gamesPerLevel: number }[]>([]);
  const [xpHistory, setXpHistory] = useState<{ date: string; xp: number; gained: number }[]>([]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    fetchMe();
    statsApi.getMyStats().then((r) => setStats(r.data)).catch(() => {});
    statsApi.getMazeSoloProgress().then((r) => {
      const completed = Array.isArray(r.data?.completedLevels) ? (r.data.completedLevels as number[]) : [];
      const entries = Array.isArray(r.data?.entries) ? r.data.entries : [];
      const best: Record<number, number> = {};
      entries.forEach((entry: any) => {
        if (typeof entry.level === 'number') {
          best[entry.level] = typeof entry.bestScore === 'number' ? entry.bestScore : 0;
        }
      });
      setMazeSoloCompleted(completed);
      setMazeSoloBestScores(best);
    }).catch(() => {});
    api.get<{ level: number; displayName: string; gamesPerLevel: number }[]>('/games/levels/labirinturi')
      .then((r) => setMazeSoloLevels([...r.data].sort((a, b) => a.level - b.level)))
      .catch(() => {});
    statsApi.getIntegrameSoloProgress()
      .then((r) => setIntegrameSoloGames(Array.isArray(r.data?.completedGames) ? r.data.completedGames : []))
      .catch(() => {});
    api.get<{ level: number; displayName: string; gamesPerLevel: number }[]>('/games/levels/integrame')
      .then((r) => setIntegrameSoloLevels([...r.data].sort((a, b) => a.level - b.level)))
      .catch(() => {});
  }, [_hasHydrated, token]);

  useEffect(() => {
    if (!_hasHydrated || !token) return;
    statsApi.getXpHistory(selectedGame)
      .then((r) => setXpHistory(Array.isArray(r.data?.history) ? r.data.history : []))
      .catch(() => {});
  }, [_hasHydrated, token, selectedGame]);

  useEffect(() => {
    if (games.length === 0) return;
    const ids = games.map((game) => game.id);
    if (!ids.includes(selectedGame)) {
      setSelectedGame(ids[0] || 'integrame');
    }
  }, [games, selectedGame]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      await usersApi.uploadAvatar(file);
      await fetchMe(); // refresh user in store → se propagă peste tot
    } catch {
      setUploadError('Eroare la upload. Încearcă din nou.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (!_hasHydrated) return <div className="min-h-screen" style={{ background: '#020617' }} />;

  const currentStats = stats.find((s) => s.gameType === selectedGame);
  const rawElo = currentStats?.eloHistory;
  const eloHistory: { date: string; rating: number }[] = Array.isArray(rawElo)
    ? rawElo
    : (typeof rawElo === 'string' ? (() => { try { return JSON.parse(rawElo); } catch { return []; } })() : []);
  const currentElo = eloHistory.length > 0 ? eloHistory[eloHistory.length - 1].rating : null;

  if (!user) return null;

  return (
    <>
      <div className="min-h-screen" style={{ background: '#020617' }}>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="rounded-[36px] border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-6 flex items-center gap-6">
          {/* Avatar cu upload */}
          <div className="relative group shrink-0">
            <img
              src={user.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${user.username}`}
              alt={user.username}
              className="w-20 h-20 rounded-2xl border-2 border-emerald-500 object-cover"
            />
            {/* Overlay hover */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-2xl bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {uploading
                ? <Loader2 size={20} className="text-white animate-spin" />
                : <Camera size={20} className="text-white" />}
              {!uploading && <span className="text-white text-[10px] font-medium">Schimbă</span>}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user.username}</h1>
            <p className="text-slate-400 text-sm">{user.email}</p>
            {uploadError && <p className="text-red-400 text-xs mt-1">{uploadError}</p>}
            <div className="flex gap-4 mt-2">
              <div><span className="text-slate-500 text-xs">Rating</span><br /><span className="font-bold text-emerald-400">{user.rating}</span></div>
              <div><span className="text-slate-500 text-xs">XP</span><br /><span className="font-bold text-yellow-400">{user.xp}</span></div>
              <div><span className="text-slate-500 text-xs">Ligă</span><br /><span className={`badge-${user.league}`}>{user.league}</span></div>
            </div>
          </div>
        </div>

        {/* Game selector */}
        <div className="flex gap-2">
          {games.map((game) => (
            <button
              key={game.id}
              onClick={() => setSelectedGame(game.id)}
              className={selectedGame === game.id ? 'text-sm rounded-full px-5 py-2 bg-amber-300 text-slate-950 font-semibold' : 'text-sm rounded-full px-5 py-2 bg-slate-800/60 border border-slate-700 text-slate-300 hover:bg-slate-700/60 font-semibold'}
            >
              {game.emoji} {game.label}
            </button>
          ))}
        </div>

        {/* ELO Chart */}
        {currentElo !== null && (
          <div className="rounded-[36px] border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Evoluție ELO – {selectedGame}</h2>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-sky-400">{currentElo}</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${currentStats?.gameType ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50' : 'bg-slate-800 text-slate-400'}`}>
                  {user.league}
                </span>
              </div>
            </div>
            {eloHistory.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={eloHistory}>
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString('ro')} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString('ro')}
                  />
                  <Line type="monotone" dataKey="rating" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-sm text-center py-8">Joacă mai multe meciuri pentru a vedea evoluția ELO</p>
            )}
          </div>
        )}

        {/* XP Chart */}
        {(xpHistory.length > 0 || user.xp > 0) && (
          <div className="rounded-[36px] border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Evoluție XP – {selectedGame}</h2>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-yellow-400">
                  {xpHistory.length > 0 ? xpHistory[xpHistory.length - 1].xp : user.xp}
                </span>
                <span className="text-xs text-slate-400">XP câștigate</span>
              </div>
            </div>
            {xpHistory.length > 1 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={xpHistory}>
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString('ro')} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString('ro')}
                    formatter={(value: number, name: string) => [value, name === 'xp' ? 'XP cumulat' : name]}
                  />
                  <Line type="monotone" dataKey="xp" stroke="#facc15" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 text-sm text-center py-8">Joacă mai multe meciuri pentru a vedea evoluția XP</p>
            )}
          </div>
        )}

        {/* Stats grid */}
        {currentStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Meciuri', value: currentStats.totalMatches },
              { label: 'Victorii', value: currentStats.wins },
              { label: 'Win Rate', value: `${currentStats.totalMatches > 0 ? ((currentStats.wins / currentStats.totalMatches) * 100).toFixed(1) : 0}%` },
              { label: 'Best Score', value: currentStats.bestScore },
              { label: 'Streak curent', value: currentStats.currentStreak },
              { label: 'Best Streak', value: currentStats.bestStreak },
              { label: 'Score total', value: currentStats.totalScore },
              { label: 'Score mediu', value: currentStats.avgScore.toFixed(1) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/60 text-center py-4 px-2">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-slate-400 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Solo progress — tab-aware */}
        <div className="rounded-[36px] border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-6">
          {selectedGame === 'labirinturi' ? (
            <>
              <h2 className="text-lg font-bold mb-1">🌀 Labirinturi Solo</h2>
              <p className="text-slate-400 text-sm mb-4">
                Progres sincronizat pe cont: {mazeSoloCompleted.length}/{mazeSoloLevels.length || 5} niveluri completate
              </p>
              <div className={`grid gap-3 grid-cols-2 ${mazeSoloLevels.length <= 3 ? 'sm:grid-cols-3' : mazeSoloLevels.length === 4 ? 'sm:grid-cols-4' : mazeSoloLevels.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-6'}`}>
                {(mazeSoloLevels.length > 0 ? mazeSoloLevels : [1,2,3,4,5].map((l) => ({ level: l, displayName: `Nivel ${l}`, gamesPerLevel: 4 }))).map(({ level, displayName }) => {
                  const done = mazeSoloCompleted.includes(level);
                  return (
                    <div key={level} className={`rounded-xl border p-3 text-center ${done ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-slate-700 bg-slate-800/50'}`}>
                      <div className="text-sm text-slate-300 font-semibold">{displayName || `Nivel ${level}`}</div>
                      <div className={`text-xs mt-1 font-medium ${done ? 'text-emerald-300' : 'text-slate-500'}`}>
                        {done ? 'Completat' : 'Necompletat'}
                      </div>
                      <div className="text-[11px] mt-2 text-slate-400">
                        Best: {mazeSoloBestScores[level] ?? 0}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold mb-1">📝 Integrame Solo</h2>
              <p className="text-slate-400 text-sm mb-4">
                Progres sincronizat pe cont: {integrameSoloLevels.reduce((acc, cfg) => acc + (cfg.gamesPerLevel ?? 3), 0) > 0
                  ? `${integrameSoloGames.length} / ${integrameSoloLevels.reduce((acc, cfg) => acc + (cfg.gamesPerLevel ?? 3), 0)} jocuri completate`
                  : `${integrameSoloGames.length} jocuri completate`}
              </p>
              <div className={`grid gap-3 grid-cols-2 ${integrameSoloLevels.length <= 3 ? 'sm:grid-cols-3' : integrameSoloLevels.length === 4 ? 'sm:grid-cols-4' : integrameSoloLevels.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-6'}`}>
                {(integrameSoloLevels.length > 0 ? integrameSoloLevels : [1,2,3,4,5].map((l) => ({ level: l, displayName: `Nivel ${l}`, gamesPerLevel: 3 }))).map(({ level, displayName, gamesPerLevel }) => {
                  const gamesCount = gamesPerLevel ?? 3;
                  const completedInLevel = integrameSoloGames.filter((g) => g.level === level).length;
                  const allDone = completedInLevel >= gamesCount;
                  return (
                    <div key={level} className={`rounded-xl border p-3 text-center ${allDone ? 'border-violet-500/50 bg-violet-900/20' : 'border-slate-700 bg-slate-800/50'}`}>
                      <div className="text-sm text-slate-300 font-semibold">{displayName || `Nivel ${level}`}</div>
                      <div className={`text-xs mt-1 font-medium ${allDone ? 'text-violet-300' : 'text-slate-500'}`}>
                        {allDone ? 'Completat' : `${completedInLevel} / ${gamesCount}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </main>
      </div>
    </>
  );
}
