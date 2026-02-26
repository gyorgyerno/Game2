'use client';
import Link from 'next/link';
import { Trophy, Zap, Users, Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import { leaderboardApi } from '@/lib/api';
import { LeaderboardEntry } from '@integrame/shared';

export default function LandingPage() {
  const [top, setTop] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    leaderboardApi.get({ page: 1 }).then((r) => setTop(r.data.slice(0, 5))).catch(() => {});
  }, []);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center gap-8 px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/30 px-4 py-1.5 text-brand-400 text-sm font-medium">
          <Zap size={14} /> Multiplayer în timp real
        </div>
        <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight bg-gradient-to-r from-white via-brand-300 to-brand-500 bg-clip-text text-transparent">
          Integrame
          <br />Competitive
        </h1>
        <p className="max-w-xl text-slate-400 text-lg">
          Joacă integrame, slogane și alte jocuri de cuvinte în dueluri 1–20 jucători.
          Câștigă XP, urcă în clasament și provoacă prietenii.
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <Link href="/register" className="btn-primary text-base px-8 py-3">
            Începe gratuit
          </Link>
          <Link href="/login" className="btn-outline text-base px-8 py-3">
            Autentificare
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 mt-8 text-center">
          {[
            { icon: <Users size={20} />, label: 'Jucători activi', value: '10K+' },
            { icon: <Globe size={20} />, label: 'Meciuri azi', value: '5K+' },
            { icon: <Trophy size={20} />, label: 'Jocuri disponibile', value: '2+' },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-brand-400 flex justify-center mb-1">{s.icon}</div>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-slate-500 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Top players */}
      {top.length > 0 && (
        <section className="max-w-2xl mx-auto w-full px-4 pb-16">
          <h2 className="text-xl font-bold mb-4 text-center text-slate-300">🏆 Top jucători</h2>
          <div className="card divide-y divide-slate-800">
            {top.map((p) => (
              <div key={p.userId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-slate-500 text-sm font-mono">#{p.rank}</span>
                  <img
                    src={p.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${p.username}`}
                    alt={p.username}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="font-medium">{p.username}</span>
                  <span className={`badge-${p.league}`}>{p.league}</span>
                </div>
                <span className="text-brand-400 font-bold">{p.rating}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
