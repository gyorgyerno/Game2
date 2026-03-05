'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Loader2, CheckCircle2 } from 'lucide-react';
import { invitesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface PageProps {
  params: { code: string };
}

export default function InvitePage({ params }: PageProps) {
  const { code } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, _hasHydrated } = useAuthStore();
  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    invitesApi.get(code)
      .then((r) => setInvite(r.data))
      .catch((e) => setError(e.response?.data?.error || 'Invitație invalidă'))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleAccept() {
    if (!token) {
      router.push(`/register?ref=${code}`);
      return;
    }
    setAccepting(true);
    try {
      const isAI = searchParams.get('ai') === '1';
      const aiTheme = searchParams.get('theme') || undefined;
      const { data } = await invitesApi.accept(code, { isAI, aiTheme });
      router.push(data.redirectTo);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Eroare la acceptare');
    } finally {
      setAccepting(false);
    }
  }

  if (!_hasHydrated || loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-8 text-center">
        {error ? (
          <>
            <div className="text-4xl mb-4">😕</div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">Invitație invalidă</h1>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <Link href="/" className="btn-primary rounded-xl px-6 py-2.5 bg-violet-600 text-white font-semibold hover:bg-violet-700 transition">
              Înapoi acasă
            </Link>
          </>
        ) : invite ? (
          <>
            <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
              <UserPlus size={28} className="text-violet-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Ai fost invitat!</h1>
            <p className="text-gray-500 text-sm mb-2">
              <strong className="text-gray-800">{invite.creator?.username}</strong> te invită la un duel de{' '}
              <strong className="text-violet-700 capitalize">{invite.gameType}</strong>
            </p>
            <div className="flex justify-center gap-4 my-5 text-sm text-gray-500">
              <div>
                <div className="text-lg font-bold text-gray-800">Nivel {invite.level}</div>
                <div className="text-xs">nivel joc</div>
              </div>
              <div>
                <div className="text-lg font-bold text-gray-800">{invite.usedBy?.length || 0}/{invite.maxUses}</div>
                <div className="text-xs">locuri ocupate</div>
              </div>
            </div>

            {!token && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
                Trebuie să te înregistrezi pentru a accepta invitația. Vei fi adăugat automat în joc!
              </p>
            )}

            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl py-3 transition flex items-center justify-center gap-2"
            >
              {accepting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {token ? 'Acceptă și intră în joc' : 'Înregistrează-te și joacă'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
