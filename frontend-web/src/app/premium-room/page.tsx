'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { premiumRoomsApi } from '@/lib/api';
import { PremiumRoomPublic } from '@integrame/shared';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Plus, LogIn, Crown, Users, ChevronRight } from 'lucide-react';

export default function PremiumRoomIndexPage() {
  const router = useRouter();
  const { user, token, _hasHydrated } = useAuthStore();
  const isPremium = (user as any)?.plan === 'premium';
  const [myRooms, setMyRooms] = useState<PremiumRoomPublic[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    if (isPremium) {
      setLoadingRooms(true);
      premiumRoomsApi.getMyRooms()
        .then((r) => setMyRooms(r.data ?? []))
        .catch(() => {})
        .finally(() => setLoadingRooms(false));
    }
  }, [_hasHydrated, token, isPremium, router]);

  if (!_hasHydrated) return null;

  // ── PAYWALL ────────────────────────────────────────────────────────────────
  if (!isPremium) {
    return (
      <>
        <Navbar />
        <main className="max-w-xl mx-auto px-4 py-16 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-amber-500/30">
              💎
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Premium Private Rooms</h1>
          <p className="text-slate-400 mb-8 text-base">
            Creează sala ta privată și joacă orice joc disponibil cu până la 8 prieteni.
          </p>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6 mb-8 text-left space-y-3">
            {[
              '💎 Invită până la 8 prieteni — oricine poate intra gratuit',
              '🎮 Funcționează cu toate jocurile platformei',
              '🏆 Mod turneu cu mai multe runde și scoruri cumulative',
              '🎛️ Control total: joc, nivel, dificultate, timp',
              '📅 Programare meci cu dată/oră',
              '🔁 Rematch instant cu aceleași setări',
              '👁️ Spectatori opționali',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3 text-sm text-slate-200">
                <span>{f}</span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-yellow-400/5 p-6 mb-6">
            <p className="text-3xl font-bold text-amber-300 mb-1">$9.99<span className="text-base font-normal text-slate-400">/lună</span></p>
            <p className="text-slate-400 text-sm mb-4">Anulezi oricând</p>
            <button
              className="w-full py-3.5 rounded-2xl font-bold text-base bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 transition shadow-lg shadow-amber-500/25"
              onClick={() => alert('Billing va fi implementat în curând!')}
            >
              Upgrade la Premium — $9.99/lună
            </button>
          </div>

          <p className="text-slate-500 text-xs">Billing disponibil în curând. Rămâi pe fază!</p>
        </main>
      </>
    );
  }

  // ── PREMIUM DASHBOARD ──────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown size={18} className="text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Premium</span>
            </div>
            <h1 className="text-2xl font-bold">💎 Camere private</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/premium-room/join"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-sm border border-white/20 bg-white/[0.07] hover:bg-white/[0.12] text-white transition"
            >
              <LogIn size={15} /> Intră cu cod
            </Link>
            <Link
              href="/premium-room/create"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 transition shadow-md shadow-amber-500/20"
            >
              <Plus size={15} /> Crează cameră
            </Link>
          </div>
        </div>

        {loadingRooms ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : myRooms.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🎮</div>
            <p className="text-slate-400 mb-6">Nu ai camere active. Creează una sau intră într-una cu cod.</p>
            <Link
              href="/premium-room/create"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 transition"
            >
              <Plus size={16} /> Crează prima cameră
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myRooms.map((room) => (
              <Link
                key={room.id}
                href={`/premium-room/${room.id}`}
                className="flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.09] transition group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-400/15 flex items-center justify-center text-xl">
                  {room.mode === 'tournament' ? '🏆' : '⚡'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white font-mono">{room.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      room.status === 'lobby' ? 'bg-yellow-600/30 text-yellow-300' :
                      'bg-green-600/30 text-green-300'
                    }`}>
                      {room.status === 'lobby' ? 'Lobby' : 'Activ'}
                    </span>
                    <span className="text-xs text-slate-400 capitalize">{room.mode}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                    <Users size={11} />
                    <span>{room.players.length}/{room.maxPlayers} jucători</span>
                    {room.rounds.length > 0 && (
                      <>
                        <span className="mx-1">·</span>
                        <span>{room.rounds.length} rundă{room.rounds.length > 1 ? 'e' : ''}</span>
                        <span className="mx-1">·</span>
                        <span className="capitalize">{room.rounds[0]?.gameType}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-500 group-hover:text-white transition" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
