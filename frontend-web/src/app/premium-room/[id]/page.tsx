'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { premiumRoomsApi } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { PremiumRoomPublic, PremiumRoomScore } from '@integrame/shared';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Copy, Check, Users, Crown, Trophy, Clock, Play, Share2, Pencil, X, Plus, Trash2, ChevronDown } from 'lucide-react';
import FriendsInvitePanel from '@/components/premium/FriendsInvitePanel';
import { gamesApi, PremiumRoundConfig } from '@/lib/api';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'text-green-400',
  medium: 'text-yellow-400',
  hard: 'text-red-400',
};
const DIFFICULTY_LABELS: Record<string, string> = { easy: 'Ușor', medium: 'Mediu', hard: 'Greu' };

export default function PremiumRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, token, _hasHydrated } = useAuthStore();
  const [room, setRoom] = useState<PremiumRoomPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [startLoading, setStartLoading] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [finalScores, setFinalScores] = useState<PremiumRoomScore[] | null>(null);
  const [roundScores, setRoundScores] = useState<{ roundId: string; scores: PremiumRoomScore[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  const fetchRoom = useCallback(async () => {
    if (!id) return;
    try {
      const res = await premiumRoomsApi.get(id);
      setRoom(res.data);
    } catch {
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    fetchRoom();
  }, [_hasHydrated, token, fetchRoom]);

  // Socket
  useEffect(() => {
    if (!token || !id) return;
    const socket = getSocket();
    socketRef.current = socket;

    socket.emit('premium_room:join', { roomId: id });

    socket.on('premium_room:update', ({ room: r }: { room: PremiumRoomPublic }) => {
      setRoom(r);
    });

    socket.on('premium_room:round_start', ({ round }: any) => {
      setRoom((prev) => prev ? {
        ...prev,
        rounds: prev.rounds.map((r) => r.id === round.id ? round : { ...r, isActive: false }),
      } : prev);
      setRoundScores(null);
    });

    socket.on('premium_room:round_finish', ({ roundId, scores }: { roundId: string; scores: PremiumRoomScore[] }) => {
      setRoundScores({ roundId, scores });
    });

    socket.on('premium_room:finish', ({ finalScores: fs }: { finalScores: PremiumRoomScore[] }) => {
      setFinalScores(fs);
      setRoom((prev) => prev ? { ...prev, status: 'finished' } : prev);
    });

    socket.on('premium_room:rematch', ({ newRoomId }: { newRoomId: string }) => {
      router.push(`/premium-room/${newRoomId}`);
    });

    return () => {
      socket.emit('premium_room:leave', { roomId: id });
      socket.off('premium_room:update');
      socket.off('premium_room:round_start');
      socket.off('premium_room:round_finish');
      socket.off('premium_room:finish');
      socket.off('premium_room:rematch');
    };
  }, [token, id, router]);

  const handleStart = async () => {
    if (!room) return;
    setStartLoading(true);
    try {
      await premiumRoomsApi.start(room.id);
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Eroare la pornire.');
    } finally {
      setStartLoading(false);
    }
  };

  const handleRematch = async () => {
    if (!room) return;
    setRematchLoading(true);
    try {
      await premiumRoomsApi.rematch(room.id);
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Eroare la rematch.');
    } finally {
      setRematchLoading(false);
    }
  };

  const copyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isOwner = room?.ownerId === user?.id;
  const activeRound = room?.rounds.find((r) => r.isActive);
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/premium-room/join?code=${room?.code}` : '';
  const canEdit = isOwner && room?.status === 'lobby';

  if (!_hasHydrated || loading) {
    return (
      <>
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!room) return null;

  // ── RESULTS SCREEN ─────────────────────────────────────────────────────────
  if (room.status === 'finished' && finalScores && finalScores.length > 0) {
    const winner = finalScores[0];
    return (
      <>
        <Navbar />
        <main className="max-w-xl mx-auto px-4 py-10">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🏆</div>
            <h1 className="text-3xl font-bold text-amber-300">Câștigător!</h1>
            <p className="text-xl text-white font-semibold mt-1">{winner.username}</p>
            <p className="text-3xl font-bold text-amber-400 mt-1">{winner.score} pct</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 mb-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Trophy size={15} /> Clasament final
            </h3>
            <div className="space-y-2">
              {finalScores.map((s, i) => (
                <div key={s.userId} className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-white/[0.03]'}`}>
                  <span className={`text-lg font-bold w-6 text-center ${i === 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <span className={`flex-1 font-semibold ${s.userId === user?.id ? 'text-amber-200' : 'text-white'}`}>
                    {s.username} {s.userId === user?.id && '(tu)'}
                  </span>
                  <span className="font-bold text-amber-300">{s.score} pct</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scoruri per rundă */}
          {room.rounds.length > 1 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 mb-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Scoruri per rundă</h3>
              {room.rounds.map((round) => {
                const scores = room.roundScores[round.id] ?? [];
                if (scores.length === 0) return null;
                return (
                  <div key={round.id} className="mb-3">
                    <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">
                      Runda {round.order} — {round.gameType}
                    </p>
                    {scores.sort((a, b) => b.score - a.score).map((s) => (
                      <div key={s.userId} className="flex items-center gap-2 text-sm py-1">
                        <span className="text-slate-400 w-4">{s.position}.</span>
                        <span className={`flex-1 ${s.userId === user?.id ? 'text-amber-200 font-semibold' : 'text-white'}`}>{s.username}</span>
                        <span className="text-slate-300 font-semibold">{s.score} pct</span>
                        {s.timeTaken && <span className="text-slate-500 text-xs">{s.timeTaken}s</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-3">
            {isOwner && (
              <button
                onClick={handleRematch}
                disabled={rematchLoading}
                className="flex-1 py-3.5 rounded-2xl font-bold bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 disabled:opacity-60 transition"
              >
                {rematchLoading ? 'Se creează...' : '🔁 Rematch'}
              </button>
            )}
            <Link href="/dashboard" className="flex-1 py-3.5 rounded-2xl font-bold bg-white/10 hover:bg-white/20 text-white text-center transition">
              🏠 Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  // ── LOBBY ───────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      {showEdit && room && (
        <EditRoomModal
          room={room}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => { setRoom(updated); setShowEdit(false); }}
        />
      )}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-6 items-start">
          {/* ── Coloana stângă (conținut principal) ── */}
          <div className="flex-1 min-w-0">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <button onClick={() => router.push('/dashboard')} className="text-xs text-slate-400 hover:text-white mb-2">
              ← Dashboard
            </button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              💎 {room.name ? <span className="uppercase">{room.name.toUpperCase()}</span> : 'Cameră privată'}
              <span className={`text-sm px-2 py-0.5 rounded-full font-semibold ${
                room.status === 'lobby' ? 'bg-yellow-600/30 text-yellow-300' :
                room.status === 'active' ? 'bg-green-600/30 text-green-300 animate-pulse' :
                'bg-slate-600/30 text-slate-400'
              }`}>
                {room.status === 'lobby' ? '⏳ Lobby' : room.status === 'active' ? '🟢 Activ' : '✅ Final'}
              </span>
            </h1>
            {canEdit && (
              <button
                onClick={() => setShowEdit(true)}
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-amber-300 transition"
              >
                <Pencil size={12} /> Editează setările
              </button>
            )}
          </div>
          {/* Cod de invitație */}
          <div className="text-right">
            <p className="text-xs text-slate-400 mb-1">Cod invitație</p>
            <button
              onClick={copyCode}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400/15 border border-amber-400/40 text-amber-200 font-mono font-bold text-lg hover:bg-amber-400/25 transition"
            >
              {room.code}
              {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
            </button>
          </div>
        </div>

        {/* Link invitație */}
        {room.status === 'lobby' && (
          <div className="mb-5 flex items-center gap-2 p-3 rounded-xl bg-white/[0.04] border border-white/10">
            <Share2 size={14} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400 flex-1 truncate">{inviteUrl}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-xs font-semibold text-amber-300 hover:text-amber-100 shrink-0"
            >
              {copied ? '✓ Copiat' : 'Copiază link'}
            </button>
          </div>
        )}

        {/* Jucători */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 mb-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Users size={15} /> Jucători ({room.players.length}/{room.maxPlayers})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[...room.players].sort((a, b) => {
              if (a.userId === user?.id) return -1;
              if (b.userId === user?.id) return 1;
              if (a.isOwner) return -1;
              if (b.isOwner) return 1;
              return 0;
            }).map((p) => (
              <div key={p.userId} className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${
                p.isOnline ? 'border-green-500/30 bg-green-500/5' : 'border-white/10 bg-white/[0.02]'
              }`}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center text-slate-900 font-bold text-sm">
                  {p.username[0]?.toUpperCase()}
                </div>
                <span className={`text-xs font-semibold truncate max-w-full ${p.userId === user?.id ? 'text-amber-200' : 'text-white'}`}>
                  {p.username}
                </span>
                {p.isOwner && <Crown size={10} className="text-amber-400" />}
                <span className={`w-2 h-2 rounded-full ${p.isOnline ? 'bg-green-400' : 'bg-slate-500'}`} />
              </div>
            ))}
            {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
              <div key={`empty-${i}`} className="flex flex-col items-center gap-1 p-2 rounded-xl border border-dashed border-white/10">
                <div className="w-9 h-9 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-500 text-lg">+</div>
                <span className="text-xs text-slate-500">Liber</span>
              </div>
            ))}
          </div>
        </div>

        {/* Runde */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 mb-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            {room.mode === 'tournament' ? `🏆 Turneu — ${room.rounds.length} runde` : '⚡ Quick Match'}
          </h3>
          <div className="space-y-2">
            {room.rounds.map((round) => (
              <div key={round.id} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
                round.isActive ? 'border-green-500/40 bg-green-500/10' :
                round.isFinished ? 'border-white/5 bg-white/[0.02] opacity-50' :
                'border-white/10 bg-white/[0.03]'
              }`}>
                {round.isActive && <span className="text-green-400 animate-pulse">▶</span>}
                {round.isFinished && <span className="text-slate-500">✓</span>}
                {!round.isActive && !round.isFinished && <span className="text-slate-500">{round.order}.</span>}
                <span className="font-semibold text-white capitalize">{round.gameType}</span>
                <span className="text-slate-400">Niv. {round.level}</span>
                <span className={`font-medium ${DIFFICULTY_COLORS[round.difficulty]}`}>{DIFFICULTY_LABELS[round.difficulty]}</span>
                <span className="ml-auto text-slate-400 flex items-center gap-1">
                  <Clock size={12} />{round.timeLimit}s
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scor rundă curentă */}
        {roundScores && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 mb-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Scor rundă finalizată</h3>
            {roundScores.scores.map((s, i) => (
              <div key={s.userId} className="flex items-center gap-3 py-2">
                <span className="text-slate-400 w-5 text-center">{i + 1}.</span>
                <span className={`flex-1 font-semibold ${s.userId === user?.id ? 'text-amber-200' : 'text-white'}`}>{s.username}</span>
                <span className="font-bold text-amber-300">{s.score} pct</span>
              </div>
            ))}
          </div>
        )}

        {/* Acțiuni */}
        {room.status === 'lobby' && isOwner && (
          <button
            onClick={handleStart}
            disabled={startLoading || room.players.length < 2}
            className="w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 disabled:opacity-60 transition shadow-lg shadow-amber-500/20"
          >
            <Play size={18} fill="currentColor" />
            {startLoading ? 'Se pornește...' : room.players.length < 2 ? 'Necesari minim 2 jucători' : 'Pornește jocul'}
          </button>
        )}
        {room.status === 'lobby' && !isOwner && (
          <p className="text-center text-slate-400 text-sm py-4">
            Așteptați ca <span className="text-amber-300 font-semibold">{room.players.find((p) => p.isOwner)?.username}</span> să pornească jocul...
          </p>
        )}
        {room.status === 'active' && activeRound && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 text-center">
            <p className="text-green-300 font-semibold mb-1">🟢 Jocul este activ</p>
            <p className="text-white text-sm">
              Joci <span className="font-bold capitalize">{activeRound.gameType}</span> — Nivel {activeRound.level}
            </p>
            <p className="text-slate-400 text-xs mt-1">Trimite scorul prin jocul principal după ce termini.</p>
          </div>
        )}
        {room.status === 'finished' && (!finalScores || finalScores.length === 0) && (
          <div className="text-center py-8 text-slate-400">
            <p>Camera a fost finalizată.</p>
            <Link href="/dashboard" className="text-amber-300 hover:text-amber-100 font-semibold mt-2 inline-block">
              ← Înapoi la Dashboard
            </Link>
          </div>
        )}
          </div>{/* end coloana stângă */}

          {/* ── Coloana dreaptă — prieteni (doar în lobby/activ) ── */}
          {room.status !== 'finished' && (
            <div className="w-64 shrink-0 hidden lg:block sticky top-6">
              <FriendsInvitePanel
                roomId={room.id}
                playerIds={room.players.map(p => p.userId)}
                isOwner={isOwner}
              />
            </div>
          )}
        </div>{/* end flex */}
      </main>
    </>
  );
}

// ─── EditRoomModal ─────────────────────────────────────────────────────────────
const DIFFICULTY_LABELS_EDIT: Record<string, string> = { easy: '🟢 Ușor', medium: '🟡 Mediu', hard: '🔴 Greu' };
const DEFAULT_ROUND_EDIT: PremiumRoundConfig = { gameType: 'integrame', level: 1, difficulty: 'medium', timeLimit: 180 };

function EditRoomModal({
  room, onClose, onSaved,
}: {
  room: PremiumRoomPublic;
  onClose: () => void;
  onSaved: (updated: PremiumRoomPublic) => void;
}) {
  const [games, setGames] = useState<{ id: string; name: string; emoji?: string; maxLevel: number }[]>([]);
  const [mode, setMode] = useState<'quick' | 'tournament'>(room.mode as 'quick' | 'tournament');
  const [name, setName] = useState(room.name ?? '');
  const [maxPlayers, setMaxPlayers] = useState(room.maxPlayers);
  const [allowSpectators, setAllowSpectators] = useState(room.allowSpectators);
  const [rounds, setRounds] = useState<PremiumRoundConfig[]>(
    room.rounds.map(r => ({ gameType: r.gameType, level: r.level, difficulty: r.difficulty as any, timeLimit: r.timeLimit }))
  );
  // Programare
  const existingStartAt = room.startAt ? new Date(room.startAt) : null;
  const [scheduleEnabled, setScheduleEnabled] = useState(!!existingStartAt);
  const [scheduleDate, setScheduleDate] = useState(
    existingStartAt ? existingStartAt.toISOString().split('T')[0] : ''
  );
  const [scheduleTime, setScheduleTime] = useState(
    existingStartAt ? existingStartAt.toTimeString().slice(0, 5) : '20:00'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    gamesApi.getAll().then(r => {
      const raw: any[] = r.data?.games ?? r.data ?? [];
      setGames(raw.filter(g => g.isActive !== false).map(g => ({
        id: g.id === 'maze' ? 'labirinturi' : g.id,
        name: g.name ?? g.id,
        emoji: g.emoji,
        maxLevel: g.maxLevel ?? 5,
      })));
    }).catch(() => {});
  }, []);

  const maxLevelFor = (gt: string) => games.find(g => g.id === gt)?.maxLevel ?? 5;

  const addRound = () => setRounds(p => [...p, { ...DEFAULT_ROUND_EDIT, gameType: games[0]?.id ?? 'integrame' }]);
  const removeRound = (i: number) => setRounds(p => p.filter((_, idx) => idx !== i));
  const updateRound = (i: number, patch: Partial<PremiumRoundConfig>) =>
    setRounds(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const startAt = scheduleEnabled && scheduleDate
        ? new Date(`${scheduleDate}T${scheduleTime || '20:00'}:00`).toISOString()
        : null;
      const res = await premiumRoomsApi.updateSettings(room.id, {
        name: name.trim() || null,
        mode, maxPlayers, allowSpectators, rounds,
        startAt: startAt ?? undefined,
      });
      onSaved(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Eroare la salvare.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-amber-400/20 bg-[#0d0f17] shadow-2xl shadow-amber-500/10 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Pencil size={16} className="text-amber-400" /> Editează camera
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          {/* Nume */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nume cameră <span className="text-slate-600">(opțional)</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={40}
              placeholder="ex. Finala Joi Seară"
              className="text-sm bg-slate-800 border border-slate-600 text-white rounded-xl px-3 py-2 outline-none w-full" />
            {name.trim() && (
              <p className="text-xs text-amber-300/70 mt-1">Va apărea ca: <span className="font-bold uppercase">{name.trim().toUpperCase()}</span></p>
            )}
          </div>

          {/* Mod */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block font-semibold uppercase tracking-wide">Mod de joc</label>
            <div className="flex gap-2">
              {(['quick', 'tournament'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2.5 rounded-xl font-semibold text-sm border transition ${
                    mode === m ? 'border-amber-400/60 bg-amber-400/15 text-amber-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}>
                  {m === 'quick' ? '⚡ Quick Match' : '🏆 Turneu'}
                </button>
              ))}
            </div>
          </div>

          {/* Setări generale */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Max jucători</label>
              <div className="relative">
                <select value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                  className="appearance-none pr-7 text-sm bg-slate-800 border border-slate-600 text-white rounded-xl px-3 py-2 outline-none">
                  {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} jucători</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
              <input type="checkbox" checked={allowSpectators} onChange={e => setAllowSpectators(e.target.checked)}
                className="w-4 h-4 accent-amber-400" />
              <span className="text-slate-300">Permite spectatori</span>
            </label>
          </div>

          {/* Programare */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-300">📅 Programare</label>
              <button type="button" onClick={() => setScheduleEnabled(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${scheduleEnabled ? 'bg-amber-400' : 'bg-slate-600'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${scheduleEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            {scheduleEnabled && (
              <div className="mt-3 flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[130px]">
                  <label className="text-xs text-slate-400 mb-1 block">Data</label>
                  <input type="date" value={scheduleDate} min={new Date().toISOString().split('T')[0]}
                    onChange={e => setScheduleDate(e.target.value)}
                    className="text-sm bg-slate-800 border border-slate-600 text-white rounded-xl px-3 py-2 outline-none w-full" />
                </div>
                <div className="w-32">
                  <label className="text-xs text-slate-400 mb-1 block">Ora</label>
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                    className="text-sm bg-slate-800 border border-slate-600 text-white rounded-xl px-3 py-2 outline-none w-full" />
                </div>
                {scheduleDate && (
                  <p className="w-full text-xs text-amber-300/80 mt-1">
                    ⏰ {new Date(`${scheduleDate}T${scheduleTime}:00`).toLocaleString('ro-RO', {
                      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            )}
            {!scheduleEnabled && existingStartAt && (
              <p className="text-xs text-slate-500 mt-2">Programarea curentă va fi ștearsă la salvare.</p>
            )}
          </div>

          {/* Runde */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">
                {mode === 'quick' ? 'Setări joc' : `Runde (${rounds.length})`}
              </label>
              {mode === 'tournament' && (
                <button onClick={addRound} disabled={rounds.length >= 20}
                  className="flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-100 disabled:opacity-40">
                  <Plus size={13} /> Adaugă
                </button>
              )}
            </div>
            <div className="space-y-2">
              {rounds.map((round, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
                  {mode === 'tournament' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300">Runda {idx + 1}</span>
                      {rounds.length > 1 && (
                        <button onClick={() => removeRound(idx)} className="text-red-400 hover:text-red-300">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 mb-1 block">Joc</label>
                      <div className="relative">
                        <select value={round.gameType} onChange={e => updateRound(idx, { gameType: e.target.value, level: 1 })}
                          className="appearance-none pr-6 text-xs bg-slate-800 border border-slate-600 text-white rounded-lg px-2 py-1.5 w-full outline-none">
                          {games.map(g => <option key={g.id} value={g.id}>{g.emoji ? `${g.emoji} ` : ''}{g.name}</option>)}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 mb-1 block">Nivel</label>
                      <div className="relative">
                        <select value={round.level} onChange={e => updateRound(idx, { level: Number(e.target.value) })}
                          className="appearance-none pr-6 text-xs bg-slate-800 border border-slate-600 text-white rounded-lg px-2 py-1.5 w-full outline-none">
                          {Array.from({ length: maxLevelFor(round.gameType) }, (_, i) => i + 1).map(l =>
                            <option key={l} value={l}>Nivel {l}</option>)}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 mb-1 block">Dificultate</label>
                      <div className="relative">
                        <select value={round.difficulty} onChange={e => updateRound(idx, { difficulty: e.target.value as any })}
                          className="appearance-none pr-6 text-xs bg-slate-800 border border-slate-600 text-white rounded-lg px-2 py-1.5 w-full outline-none">
                          {Object.entries(DIFFICULTY_LABELS_EDIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 mb-1 block">Timp (sec)</label>
                      <input type="number" min={30} max={3600} step={30} value={round.timeLimit}
                        onChange={e => updateRound(idx, { timeLimit: Number(e.target.value) })}
                        className="text-xs bg-slate-800 border border-slate-600 text-white rounded-lg px-2 py-1.5 w-full outline-none" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* Acțiuni */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-2xl font-semibold text-sm border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 transition">
              Anulează
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 disabled:opacity-60 transition shadow-lg shadow-amber-500/20">
              {saving ? 'Se salvează...' : '💾 Salvează'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
