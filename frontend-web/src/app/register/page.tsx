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
      if (data.otp) { setDevOtp(data.otp); setOtp(data.otp); }
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
      setError(err.response?.data?.error || 'Eroare la inregistrare');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full rounded-2xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none transition';
  const inputStyle = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(12px)',
  } as React.CSSProperties;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden" style={{ background: '#020617' }}>
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div style={{ background: 'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(52,211,153,0.12) 0%, transparent 70%)' }} className="absolute inset-0" />
        <div style={{ background: 'radial-gradient(ellipse 50% 40% at 80% 80%, rgba(139,92,246,0.10) 0%, transparent 70%)' }} className="absolute inset-0" />
        <div style={{ background: 'radial-gradient(ellipse 40% 35% at 60% 10%, rgba(56,189,248,0.07) 0%, transparent 70%)' }} className="absolute inset-0" />
      </div>
      <Link href="/" className="text-2xl font-display font-bold text-emerald-400 mb-8 hover:text-emerald-300 transition">
        Integrame
      </Link>

      <div
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.13), inset 0 -1px 0 rgba(0,0,0,0.2)',
        }}
        className="relative w-full max-w-md rounded-[36px] border border-white/10 backdrop-blur-2xl p-8 z-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            {step === 'form' ? 'Creeaza cont' : 'Verifica emailul'}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {step === 'form'
              ? 'Joaca gratuit cu prietenii tai'
              : <span>Am trimis un cod la <strong className="text-white">{email}</strong></span>
            }
          </p>
        </div>

        {step === 'form' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@exemplu.ro" className={`${inputCls} pl-10`} style={inputStyle} required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Username</label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="superman123" className={`${inputCls} pl-10`} style={inputStyle}
                  minLength={3} maxLength={20} required
                />
              </div>
            </div>
            {referralCode && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2 text-emerald-400 text-sm">
                Ai fost invitat! Cod referral: <strong>{referralCode}</strong>
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit" disabled={loading}
              style={{
                background: 'linear-gradient(135deg, rgba(52,211,153,0.55) 0%, rgba(16,185,129,0.75) 50%, rgba(52,211,153,0.55) 100%)',
                boxShadow: '0 4px 24px rgba(16,185,129,0.40), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)',
                border: '1px solid rgba(52,211,153,0.35)',
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl backdrop-blur-xl text-white font-semibold disabled:opacity-40 hover:brightness-110 active:scale-[0.98] transition-all duration-150"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              Trimite codul OTP <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            {devOtp && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-3 text-center">
                <p className="text-yellow-400 text-xs font-medium uppercase tracking-wider mb-1">DEV MODE - cod generat local</p>
                <p className="text-yellow-300 text-3xl font-mono font-bold tracking-[0.3em]">{devOtp}</p>
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Cod OTP (6 cifre)</label>
              <input
                type="text" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)',
              }}
              className="w-full rounded-2xl px-4 py-3.5 text-white text-center text-2xl tracking-[0.4em] font-mono placeholder-slate-600 focus:outline-none transition"
                maxLength={6} autoFocus required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit" disabled={loading || otp.length !== 6}
              style={{
                background: 'linear-gradient(135deg, rgba(52,211,153,0.55) 0%, rgba(16,185,129,0.75) 50%, rgba(52,211,153,0.55) 100%)',
                boxShadow: '0 4px 24px rgba(16,185,129,0.40), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)',
                border: '1px solid rgba(52,211,153,0.35)',
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl backdrop-blur-xl text-white font-semibold disabled:opacity-40 hover:brightness-110 active:scale-[0.98] transition-all duration-150"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              Creeaza cont
            </button>
            <button
              type="button"
              onClick={() => { setStep('form'); setOtp(''); setError(''); }}
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
              className="w-full py-3 rounded-2xl backdrop-blur-xl text-white/70 hover:text-white text-sm font-semibold hover:bg-white/[0.05] active:scale-[0.98] transition-all duration-150"
            >
              Inapoi
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-white/[0.07] text-center text-sm text-slate-500">
          Ai deja cont?{' '}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition">
            Autentifica-te
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#020617' }}>
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <RegisterPageInner />
    </Suspense>
  );
}
