'use client';
import { Suspense } from 'react';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, User, ArrowRight, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type Step = 'form' | 'otp';

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get('ref') || '';
  const { setAuth } = useAuthStore();

  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devOtp, setDevOtp] = useState('');

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await authApi.sendOtp(email);
      if (data.otp) {
        setDevOtp(data.otp);
        setOtp(data.otp);
      }
      setStep('otp');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Eroare la trimitere OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await authApi.register(email, username, otp, referralCode || undefined);
      setAuth(data.token, data.user);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Eroare la înregistrare');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Creează cont</h1>
          <p className="text-slate-400 mt-1">Joacă gratuit cu prietenii tăi</p>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@exemplu.ro" className="input pl-9" required />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Username</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="superman123" className="input pl-9" minLength={3} maxLength={20} required />
              </div>
            </div>
            {referralCode && (
              <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl px-4 py-2 text-brand-400 text-sm">
                🎁 Ai fost invitat! Cod referral: <strong>{referralCode}</strong>
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              Trimite codul OTP <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <p className="text-slate-400 text-sm text-center">
              Am trimis un cod la <strong className="text-white">{email}</strong>
            </p>
            {devOtp && (
              <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl px-4 py-3 text-center">
                <p className="text-yellow-400 text-xs font-medium uppercase tracking-wider mb-1">⚙️ DEV MODE – cod generat local</p>
                <p className="text-yellow-300 text-3xl font-mono font-bold tracking-[0.3em]">{devOtp}</p>
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cod OTP (6 cifre)</label>
              <input type="text" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456" className="input text-center text-2xl tracking-widest font-mono"
                maxLength={6} required />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading || otp.length !== 6}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              Creează cont
            </button>
            <button type="button" onClick={() => { setStep('form'); setOtp(''); setError(''); }}
              className="btn-outline w-full text-sm">Înapoi</button>
          </form>
        )}

        <p className="text-center text-slate-500 text-sm mt-6">
          Ai deja cont?{' '}
          <Link href="/login" className="text-brand-400 hover:underline">Autentifică-te</Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <RegisterPageInner />
    </Suspense>
  );
}
