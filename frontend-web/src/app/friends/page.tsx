'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { friendsApi, matchesApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import Navbar from '@/components/Navbar';

type Friend = { id: string; username: string; avatarUrl?: string; rating: number; league: string; isOnline: boolean };
type FriendRequest = { id: string; sender: Friend };
type SentRequest = { id: string; receiver: Friend };

const GAME_OPTIONS = [
  { value: 'integrame', label: '🧩 Integramă' },
  { value: 'labirinturi', label: '🌀 Labirint' },
  { value: 'slogane', label: '💬 Slogane' },
];

export default function FriendsPage() {
  const router = useRouter();
  const { token, _hasHydrated } = useAuthStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendMsg, setFriendMsg] = useState('');
  const [friendMsgType, setFriendMsgType] = useState<'ok' | 'err'>('ok');
  const [friendLoading, setFriendLoading] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<Friend | null>(null);
  const [challengeGame, setChallengeGame] = useState('integrame');
  const [challengeLevel, setChallengeLevel] = useState(1);
  const [challengeLoading, setChallengeLoading] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    refreshFriends();

    // Subscribe to friend online/offline events
    const socket = getSocket();
    const handler = ({ userId, isOnline }: { userId: string; isOnline: boolean }) => {
      setFriends(prev => prev.map(f => f.id === userId ? { ...f, isOnline } : f));
    };
    socket.on('friend_status_changed', handler);
    return () => { socket.off('friend_status_changed', handler); };
  }, [_hasHydrated, token]);

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
      setFriendMsgType('ok');
      setFriendSearch('');
      await refreshFriends();
    } catch (e: any) {
      setFriendMsg(e?.response?.data?.error || 'Eroare la trimitere.');
      setFriendMsgType('err');
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

  async function handleChallenge() {
    if (!challengeTarget) return;
    setChallengeLoading(true);
    try {
      const r = await matchesApi.findOrCreate(challengeGame, challengeLevel, false);
      const matchId = r.data.id;
      const socket = getSocket();
      socket.emit('friend_invite', {
        targetUserId: challengeTarget.id,
        matchId,
        gameType: challengeGame,
        level: challengeLevel,
      });
      setChallengeTarget(null);
      router.push(`/games/${challengeGame}/play?matchId=${matchId}&mode=friends`);
    } catch {
      setChallengeLoading(false);
    }
  }

  if (!_hasHydrated) return <div className="min-h-screen" style={{ background: '#020617' }} />;

  return (
    <>
      <div className="min-h-screen" style={{ background: '#020617' }}>
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

          <div className="flex items-center gap-3">
            <UserPlus size={22} className="text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Prieteni</h1>
          </div>

          <div className="rounded-[36px] border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-6 space-y-5">

            {/* Adaugă prieten */}
            <div>
              <h2 className="text-sm font-semibold text-slate-400 mb-2">Adaugă prieten</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendRequest()}
                  placeholder="Username-ul prietenului..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-white placeholder:text-slate-500"
                />
                <button
                  onClick={handleSendRequest}
                  disabled={friendLoading}
                  className="rounded-xl px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-60"
                >
                  {friendLoading ? '...' : 'Trimite cerere'}
                </button>
              </div>
              {friendMsg && (
                <p className={`text-sm mt-2 ${friendMsgType === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {friendMsg}
                </p>
              )}
            </div>

            {/* Cereri primite */}
            {friendRequests.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-400 mb-2">Cereri primite ({friendRequests.length})</h2>
                <div className="space-y-2">
                  {friendRequests.map(({ id, sender }) => (
                    <div key={id} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2">
                      <img
                        src={sender.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${sender.username}`}
                        alt={sender.username}
                        className="w-8 h-8 rounded-lg border border-slate-600 object-cover"
                      />
                      <span className="flex-1 text-sm font-medium text-white">{sender.username}</span>
                      <button onClick={() => handleAccept(id)} className="text-xs rounded-lg px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors">Acceptă</button>
                      <button onClick={() => handleRemove(id)} className="text-xs rounded-lg px-3 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 font-semibold transition-colors">Refuză</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cereri trimise */}
            <div>
              <h2 className="text-sm font-semibold text-slate-400 mb-2">⏳ Cereri trimise ({sentRequests.length})</h2>
              {sentRequests.length === 0 ? (
                <p className="text-slate-600 text-xs italic px-1">Nicio cerere în așteptare.</p>
              ) : (
                <div className="space-y-2">
                  {sentRequests.map(({ id, receiver }) => (
                    <div key={id} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2">
                      <img
                        src={receiver.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${receiver.username}`}
                        alt={receiver.username}
                        className="w-8 h-8 rounded-lg border border-slate-600 object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{receiver.username}</p>
                        <p className="text-[11px] text-slate-500">Cerere în așteptare</p>
                      </div>
                      <span className="text-xs text-yellow-400/80 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-2 py-0.5">Pending</span>
                      <button onClick={() => handleRemove(id)} className="text-xs text-slate-500 hover:text-red-400 transition-colors ml-1">✕ Anulează</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lista prieteni */}
            <div>
              <h2 className="text-sm font-semibold text-slate-400 mb-2">
                Prieteni ({friends.length})
                {friends.some(f => f.isOnline) && (
                  <span className="ml-2 text-emerald-400">· {friends.filter(f => f.isOnline).length} online</span>
                )}
              </h2>
              {friends.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Nu ai prieteni adăugați încă.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[...friends].sort((a, b) => Number(b.isOnline) - Number(a.isOnline)).map((f) => (
                    <div key={f.id} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2">
                      <div className="relative shrink-0">
                        <img
                          src={f.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${f.username}`}
                          alt={f.username}
                          className="w-9 h-9 rounded-lg border border-slate-600 object-cover"
                        />
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800"
                          style={{ background: f.isOnline ? '#10b981' : '#475569' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{f.username}</p>
                        <p className="text-xs" style={{ color: f.isOnline ? '#6ee7b7' : '#64748b' }}>
                          {f.isOnline ? 'Online' : 'Offline'} · {f.league} · {f.rating} ELO
                        </p>
                      </div>
                      {f.isOnline && (
                        <button
                          onClick={() => { setChallengeTarget(f); setChallengeGame('integrame'); setChallengeLevel(1); }}
                          className="text-xs rounded-lg px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors"
                        >
                          ⚔️ Provoacă
                        </button>
                      )}
                      <button onClick={() => handleRemove(f.id)} className="text-xs text-slate-500 hover:text-red-400 transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </main>
      </div>

      {/* ── Modal Provoacă ── */}
      {challengeTarget && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setChallengeTarget(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          }}
        >
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 20,
            padding: 28, minWidth: 320, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
                ⚔️ Provoacă la meci
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
                Invitație pentru <strong style={{ color: '#e2e8f0' }}>{challengeTarget.username}</strong>
              </p>
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Joc</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {GAME_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setChallengeGame(g.value)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 10, border: '1px solid',
                      borderColor: challengeGame === g.value ? '#8b5cf6' : '#334155',
                      background: challengeGame === g.value ? '#4c1d95' : '#0f172a',
                      color: challengeGame === g.value ? '#e9d5ff' : '#94a3b8',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Nivel</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3, 4, 5].map((l) => (
                  <button
                    key={l}
                    onClick={() => setChallengeLevel(l)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid',
                      borderColor: challengeLevel === l ? '#8b5cf6' : '#334155',
                      background: challengeLevel === l ? '#4c1d95' : '#0f172a',
                      color: challengeLevel === l ? '#e9d5ff' : '#94a3b8',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleChallenge}
                disabled={challengeLoading}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: '#7c3aed', color: '#fff', fontWeight: 700,
                  fontSize: 14, cursor: challengeLoading ? 'not-allowed' : 'pointer',
                  opacity: challengeLoading ? 0.7 : 1,
                }}
              >
                {challengeLoading ? 'Se crează meciul…' : '🎮 Trimite invitație'}
              </button>
              <button
                onClick={() => setChallengeTarget(null)}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: '1px solid #334155',
                  background: 'transparent', color: '#94a3b8', fontWeight: 600,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
