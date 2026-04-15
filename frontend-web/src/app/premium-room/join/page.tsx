'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { premiumRoomsApi } from '@/lib/api';
import Navbar from '@/components/Navbar';

export default function JoinPremiumRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, _hasHydrated } = useAuthStore();
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-join dacă codul e din URL
  useEffect(() => {
    if (!_hasHydrated || !token) return;
    const urlCode = searchParams.get('code');
    if (urlCode && urlCode.length >= 4) {
      handleJoin(urlCode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated, token]);

  const handleJoin = async (c?: string) => {
    const joinCode = (c ?? code).trim().toUpperCase();
    if (!joinCode) return;
    setLoading(true);
    setError('');
    try {
      const res = await premiumRoomsApi.join(joinCode);
      router.push(`/premium-room/${res.data.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.response?.data?.message ?? 'Cod invalid sau cameră indisponibilă.');
      setLoading(false);
    }
  };

  if (!_hasHydrated) return null;
  if (!token) { router.push('/login'); return null; }

  return (
    <>
      <Navbar />
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-4">💎</div>
        <h1 className="text-2xl font-bold mb-2">Intră în cameră privată</h1>
        <p className="text-slate-400 text-sm mb-8">Introdu codul de 6 caractere primit de la host.</p>

        <div className="flex gap-2 max-w-xs mx-auto mb-4">
          <input
            type="text"
            maxLength={8}
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            className="input flex-1 text-center text-xl font-mono tracking-widest bg-slate-800 border-slate-600 rounded-xl text-white uppercase"
            autoFocus
          />
          <button
            onClick={() => handleJoin()}
            disabled={loading || code.length < 4}
            className="px-5 rounded-xl font-bold bg-amber-400 text-slate-900 hover:bg-amber-300 disabled:opacity-60 transition"
          >
            {loading ? '...' : '→'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </main>
    </>
  );
}
