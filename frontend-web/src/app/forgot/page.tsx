'use client';
import Link from 'next/link';
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react';

export default function ForgotPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden" style={{ background: '#020617' }}>
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div style={{ background: 'radial-gradient(ellipse 60% 50% at 20% 20%, rgba(52,211,153,0.12) 0%, transparent 70%)' }} className="absolute inset-0" />
        <div style={{ background: 'radial-gradient(ellipse 50% 40% at 80% 80%, rgba(139,92,246,0.10) 0%, transparent 70%)' }} className="absolute inset-0" />
        <div style={{ background: 'radial-gradient(ellipse 40% 35% at 60% 10%, rgba(56,189,248,0.07) 0%, transparent 70%)' }} className="absolute inset-0" />
      </div>

      <Link href="/" className="text-2xl font-display font-bold text-emerald-400 mb-8 hover:text-emerald-300 transition z-10">
        Integrame
      </Link>

      <div
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.13), inset 0 -1px 0 rgba(0,0,0,0.2)',
        }}
        className="relative w-full max-w-md rounded-[36px] border border-white/10 backdrop-blur-2xl p-8 z-10"
      >
        <div className="flex justify-center mb-6">
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(52,211,153,0.15) 0%, rgba(52,211,153,0.05) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 16px rgba(16,185,129,0.2)',
              border: '1px solid rgba(52,211,153,0.25)',
            }}
            className="w-16 h-16 rounded-2xl backdrop-blur-xl flex items-center justify-center"
          >
            <ShieldCheck size={32} className="text-emerald-400" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Autentificare fara parola</h1>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Platforma noastra foloseste autentificare prin <strong className="text-white">cod OTP</strong> trimis pe email.
            Nu exista o parola de resetat.
          </p>
        </div>

        <div className="space-y-3 mb-8">
          {[
            { step: '1', text: 'Introdu adresa ta de email pe pagina de login' },
            { step: '2', text: 'Primesti un cod de 6 cifre pe email' },
            { step: '3', text: 'Introduci codul si esti autentificat' },
          ].map((s) => (
            <div
              key={s.step}
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              className="flex items-start gap-4 p-4 rounded-2xl backdrop-blur-sm"
            >
              <span
                style={{
                  background: 'linear-gradient(135deg, rgba(52,211,153,0.55) 0%, rgba(16,185,129,0.75) 100%)',
                  boxShadow: '0 2px 8px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
                className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
              >
                {s.step}
              </span>
              <p className="text-slate-300 text-sm leading-relaxed pt-0.5">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Link
            href="/login"
            style={{
              background: 'linear-gradient(135deg, rgba(52,211,153,0.55) 0%, rgba(16,185,129,0.75) 50%, rgba(52,211,153,0.55) 100%)',
              boxShadow: '0 4px 24px rgba(16,185,129,0.40), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)',
              border: '1px solid rgba(52,211,153,0.35)',
            }}
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl backdrop-blur-xl text-white font-semibold hover:brightness-110 active:scale-[0.98] transition-all duration-150"
          >
            <Mail size={16} />
            Mergi la autentificare <ArrowRight size={16} />
          </Link>
          <Link
            href="/register"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl backdrop-blur-xl text-white/70 hover:text-white text-sm font-semibold hover:bg-white/[0.05] active:scale-[0.98] transition-all duration-150"
          >
            Nu ai cont? Inregistreaza-te
          </Link>
        </div>
      </div>
    </div>
  );
}
