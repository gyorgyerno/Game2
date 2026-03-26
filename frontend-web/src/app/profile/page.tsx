'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { statsApi, usersApi, friendsApi } from '@/lib/api';
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

  // Friends
  type Friend = { id: string; username: string; avatarUrl?: string; rating: number; league: string };
  type FriendRequest = { id: string; sender: Friend };
  type SentRequest = { id: string; receiver: Friend };
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendMsg, setFriendMsg] = useState('');
  const [friendLoading, setFriendLoading] = useState(false);
  const [mazeSoloCompleted, setMazeSoloCompleted] = useState<number[]>([]);
  const [mazeSoloBestScores, setMazeSoloBestScores] = useState<Record<number, number>>({});

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
    friendsApi.list().then((r) => setFriends(r.data)).catch(() => {});
    friendsApi.requests().then((r) => setFriendRequests(r.data)).catch(() => {});
    friendsApi.sent().then((r) => setSentRequests(r.data)).catch(() => {});
  }, [_hasHydrated, token]);

  useEffect(() => {
    if (games.length === 0) return;
    const ids = games.map((game) => game.id);
    if (!ids.includes(selectedGame)) {
      setSelectedGame(ids[0] || 'integrame');
    }
  }, [games, selectedGame]);

  async function refreshFriends() {
    friendsApi.list().then((r) => setFriends(r.data)).catch(() => {});
    friendsApi.requests().then((r) => setFriendRequests(r.data)).catch(() => {});
    friendsApi.sent().then((r) => setSentRequests(r.data)).catch(() => {});
  }

  async function handleSendRequest() {
    if (!friendSearch.trim()) return;
    setFriendLoading(true);
    setFriendMsg('');
    try {
      await friendsApi.sendRequest(friendSearch.trim());
      setFriendMsg('Cerere trimisă!');
      setFriendSearch('');
      await refreshFriends();
    } catch (e: any) {
      setFriendMsg(e?.response?.data?.error || 'Eroare la trimitere.');
    } finally {
      setFriendLoading(false);
    }
  }

  async function handleAccept(id: string) {
    await friendsApi.accept(id).catch(() => {});
    await refreshFriends();
  }

  async function handleRemove(id: string) {
    await friendsApi.remove(id).catch(() => {});
    await refreshFriends();
  }

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

  if (!_hasHydrated) return <div className="min-h-screen bg-slate-950" />;

  const currentStats = stats.find((s) => s.gameType === selectedGame);
  const rawElo = currentStats?.eloHistory;
  const eloHistory: { date: string; elo: number }[] = Array.isArray(rawElo)
    ? rawElo
    : (typeof rawElo === 'string' ? (() => { try { return JSON.parse(rawElo); } catch { return []; } })() : []);

  if (!user) return null;

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="card flex items-center gap-6">
          {/* Avatar cu upload */}
          <div className="relative group shrink-0">
            <img
              src={user.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${user.username}`}
              alt={user.username}
              className="w-20 h-20 rounded-2xl border-2 border-brand-500 object-cover"
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
              <div><span className="text-slate-500 text-xs">Rating</span><br /><span className="font-bold text-brand-400">{user.rating}</span></div>
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
              className={selectedGame === game.id ? 'btn-primary text-sm' : 'btn-outline text-sm'}
            >
              {game.emoji} {game.label}
            </button>
          ))}
        </div>

        {/* ELO Chart */}
        {eloHistory.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-bold mb-4">Evoluție ELO – {selectedGame}</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={eloHistory}>
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString('ro')} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelFormatter={(v) => new Date(v).toLocaleDateString('ro')}
                />
                <Line type="monotone" dataKey="rating" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
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
              <div key={label} className="card text-center py-4 px-2">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-slate-400 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Labirinturi Solo progress */}
        <div className="card">
          <h2 className="text-lg font-bold mb-4">🌀 Labirinturi Solo</h2>
          <p className="text-slate-400 text-sm mb-4">
            Progres sincronizat pe cont: {mazeSoloCompleted.length}/5 niveluri completate
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((level) => {
              const done = mazeSoloCompleted.includes(level);
              return (
                <div key={level} className={`rounded-xl border p-3 text-center ${done ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-slate-700 bg-slate-800/50'}`}>
                  <div className="text-sm text-slate-300 font-semibold">Nivel {level}</div>
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
        </div>

        {/* Prieteni */}
        <div className="card space-y-4">
          <h2 className="text-lg font-bold">👥 Prieteni</h2>

          {/* Send request */}
          <div className="flex gap-2">
            <input
              type="text"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendRequest()}
              placeholder="Username-ul prietenului..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            />
            <button onClick={handleSendRequest} disabled={friendLoading} className="btn-primary text-sm px-4">
              {friendLoading ? '...' : 'Trimite cerere'}
            </button>
          </div>
          {friendMsg && <p className="text-sm text-brand-400">{friendMsg}</p>}

          {/* Cereri trimise (pending outgoing) */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-2">⏳ Cereri trimise în așteptare ({sentRequests.length})</h3>
            {sentRequests.length === 0 ? (
              <p className="text-slate-600 text-xs italic px-1">Nicio cerere în așteptare. Când trimiți o cerere, apare aici până când celălalt user o acceptă.</p>
            ) : (
              <div className="space-y-2">
                {sentRequests.map(({ id, receiver }) => (
                  <div key={id} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2">
                    <img src={receiver.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${receiver.username}`} alt={receiver.username} className="w-8 h-8 rounded-lg border border-slate-600 object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{receiver.username}</p>
                      <p className="text-[11px] text-slate-500">Cerere în așteptare — dispare când acceptă</p>
                    </div>
                    <span className="text-xs text-yellow-400/80 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-2 py-0.5">Pending</span>
                    <button onClick={() => handleRemove(id)} className="text-xs text-slate-500 hover:text-red-400 transition-colors ml-1">✕ Anulează</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cereri primite (pending incoming) */}
          {friendRequests.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Cereri primite ({friendRequests.length})</h3>
              <div className="space-y-2">
                {friendRequests.map(({ id, sender }) => (
                  <div key={id} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2">
                    <img src={sender.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${sender.username}`} alt={sender.username} className="w-8 h-8 rounded-lg border border-slate-600 object-cover" />
                    <span className="flex-1 text-sm font-medium">{sender.username}</span>
                    <button onClick={() => handleAccept(id)} className="text-xs btn-primary px-3 py-1">Acceptă</button>
                    <button onClick={() => handleRemove(id)} className="text-xs btn-outline px-3 py-1">Refuză</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends list */}
          {friends.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">Nu ai prieteni adăugați încă.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {friends.map((f) => (
                <div key={f.id} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2">
                  <img src={f.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${f.username}`} alt={f.username} className="w-9 h-9 rounded-lg border border-slate-600 object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{f.username}</p>
                    <p className="text-xs text-slate-400">{f.league} · {f.rating} ELO</p>
                  </div>
                  <button onClick={() => handleRemove(f.id)} className="text-xs text-slate-500 hover:text-red-400 transition-colors">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
