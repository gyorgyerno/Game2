'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { friendsApi } from '@/lib/api';
import Navbar from '@/components/Navbar';

type Friend = { id: string; username: string; avatarUrl?: string; rating: number; league: string };
type FriendRequest = { id: string; sender: Friend };
type SentRequest = { id: string; receiver: Friend };

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

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    refreshFriends();
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
              <h2 className="text-sm font-semibold text-slate-400 mb-2">Prieteni ({friends.length})</h2>
              {friends.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Nu ai prieteni adăugați încă.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {friends.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2">
                      <img
                        src={f.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${f.username}`}
                        alt={f.username}
                        className="w-9 h-9 rounded-lg border border-slate-600 object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{f.username}</p>
                        <p className="text-xs text-slate-400">{f.league} · {f.rating} ELO</p>
                      </div>
                      <button onClick={() => handleRemove(f.id)} className="text-xs text-slate-500 hover:text-red-400 transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </>
  );
}
