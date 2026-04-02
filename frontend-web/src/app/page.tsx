'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Trophy, Zap, Users, Globe, ShieldCheck, Timer, Rocket, Gamepad2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { leaderboardApi, contestsApi } from '@/lib/api';
import { LeaderboardEntry } from '@integrame/shared';
import { useAuthStore } from '@/store/auth';
import { useGamesCatalog } from '@/games/useGamesCatalog';

export default function LandingPage() {
  const [top, setTop] = useState<LeaderboardEntry[]>([]);
  const [featuredContest, setFeaturedContest] = useState<any | null>(null);
  const games = useGamesCatalog();
  const { token, _hasHydrated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (_hasHydrated && token) {
      router.replace('/dashboard');
    }
  }, [_hasHydrated, token, router]);

  useEffect(() => {
    leaderboardApi.get({ page: 1 }).then((r) => setTop(r.data.slice(0, 5))).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchContests = async () => {
      try {
        const { data } = await contestsApi.list();
        const contests = (data?.contests ?? []).filter((c: any) => c.status === 'waiting' || c.status === 'live');
        if (contests.length === 0) {
          setFeaturedContest(null);
          return;
        }

        // Prefer live contests first, otherwise nearest upcoming start.
        const sorted = contests.sort((a: any, b: any) => {
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (b.status === 'live' && a.status !== 'live') return 1;
          return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
        });
        setFeaturedContest(sorted[0]);
      } catch {
        setFeaturedContest(null);
      }
    };

    fetchContests();
    const id = setInterval(fetchContests, 60_000);
    return () => clearInterval(id);
  }, []);

  const isLoggedIn = Boolean(_hasHydrated && token);
  const primaryHref = isLoggedIn ? '/dashboard' : '/register';
  const primaryLabel = isLoggedIn ? 'Continua in dashboard' : 'Incepe gratuit';
  const gameCountLabel = games.length > 0 ? String(games.length) : '-';

  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero – two columns */}
      <section className="flex flex-col lg:flex-row items-center justify-center gap-0 px-0 min-h-screen">

        {/* Left – image panel */}
        <div
          className="relative w-full lg:w-1/2 min-h-[50vh] lg:min-h-screen overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #0d1b2a 0%, #0a1628 40%, #110d2e 100%)',
          }}
        >
          {/* subtle star-field */}
          <div className="pointer-events-none absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            opacity: 0.18,
          }} />

          <Image
            src="/1D.PNG"
            alt="Integrame gameplay"
            fill
            className="object-cover select-none"
            priority
          />

          {/* left-to-right overlay for better right-column contrast */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, rgba(2,6,23,0.08) 0%, rgba(2,6,23,0.26) 45%, rgba(2,6,23,0.62) 100%)',
            }}
          />

          {/* bottom fade into bg */}
          <div className="absolute bottom-0 inset-x-0 h-32 pointer-events-none"
            style={{ background: 'linear-gradient(to top, #020617 0%, transparent 100%)' }} />
        </div>

        {/* Right – hero content */}
        <div className="relative w-full lg:w-1/2 self-stretch flex flex-col items-center lg:items-start justify-center gap-8 px-8 md:px-16 py-24 lg:py-0 text-center lg:text-left" style={{ background: '#020617' }}>
          {/* ambient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div style={{ background: 'radial-gradient(ellipse 70% 50% at 80% 20%, rgba(52,211,153,0.10) 0%, transparent 70%)' }} className="absolute inset-0" />
            <div style={{ background: 'radial-gradient(ellipse 50% 40% at 20% 80%, rgba(139,92,246,0.08) 0%, transparent 70%)' }} className="absolute inset-0" />
          </div>

          <div
            className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/30 px-4 py-1.5 text-brand-400 text-sm font-medium"
            style={{ animation: 'fadeInUp 0.45s ease-out both' }}
          >
            <Zap size={14} /> Univers de jocuri multiplayer
          </div>
          <h1
            className="text-5xl md:text-6xl xl:text-7xl font-display font-bold tracking-tight"
            style={{ animation: 'fadeInUp 0.55s ease-out both', animationDelay: '0.06s' }}
          >
            <span className="bg-gradient-to-r from-white to-emerald-400 bg-clip-text text-transparent">Integrame</span>
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-sky-300 to-violet-400 bg-clip-text text-transparent">Arena</span>
          </h1>
          <p
            className="max-w-lg text-slate-400 text-lg leading-relaxed"
            style={{ animation: 'fadeInUp 0.6s ease-out both', animationDelay: '0.12s' }}
          >
            Platforma multiplayer pentru integrame, labirinturi si alte provocari de cuvinte.
            Castiga XP, urca in clasament si provoaca-ti prietenii.
          </p>

          <div
            className="flex gap-4 flex-wrap justify-center lg:justify-start"
            style={{ animation: 'fadeInUp 0.65s ease-out both', animationDelay: '0.18s' }}
          >
            <Link
              href={primaryHref}
              style={{
                background: 'linear-gradient(135deg, rgba(52,211,153,0.55) 0%, rgba(16,185,129,0.75) 50%, rgba(52,211,153,0.55) 100%)',
                boxShadow: '0 4px 24px rgba(16,185,129,0.45), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)',
              }}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold text-white backdrop-blur-xl border border-emerald-400/30 hover:brightness-110 active:scale-95 transition-all duration-150 select-none"
            >
              {primaryLabel}
            </Link>
            {!isLoggedIn && (
              <Link
                href="/login"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.12)',
                }}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold text-white/90 backdrop-blur-xl border border-white/15 hover:bg-white/[0.12] hover:border-white/25 active:scale-95 transition-all duration-150 select-none"
              >
                Autentificare
              </Link>
            )}
          </div>

          {/* Stats */}
          <div
            className="grid grid-cols-3 gap-6 mt-4"
            style={{ animation: 'fadeInUp 0.7s ease-out both', animationDelay: '0.24s' }}
          >
            {[
              { icon: <Users size={18} />, label: 'Jucători activi', value: '10K+' },
              { icon: <Globe size={18} />, label: 'Meciuri azi', value: '5K+' },
              { icon: <Trophy size={18} />, label: 'Jocuri disponibile', value: gameCountLabel },
            ].map((s) => (
              <div key={s.label} className="text-center lg:text-left">
                <div className="text-brand-400 flex justify-center lg:justify-start mb-1">{s.icon}</div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-slate-500 text-xs">{s.label}</div>
              </div>
            ))}
          </div>

        </div>
      </section>

      <section className="max-w-6xl mx-auto w-full px-4 pb-10">
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
          className="rounded-2xl border border-white/10 backdrop-blur-xl p-4 md:p-5"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: <ShieldCheck size={16} />, text: 'Login sigur cu OTP pe email' },
              { icon: <Zap size={16} />, text: 'Meciuri multiplayer in timp real' },
              { icon: <Timer size={16} />, text: 'Runde rapide, usor de intrat' },
              { icon: <Rocket size={16} />, text: 'Fara instalare, joci direct din browser' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2.5 text-sm text-slate-300">
                <span className="text-emerald-400">{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top players */}
      {top.length > 0 && (
        <section className="max-w-2xl mx-auto w-full px-4 pb-16">
          <h2 className="text-xl font-bold mb-6 text-center text-white/80 tracking-wide">🏆 Top jucători</h2>

          {/* iOS 26 liquid-glass card */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.2)',
            }}
            className="rounded-[28px] border border-white/10 backdrop-blur-2xl overflow-hidden"
          >
            {top.map((p, i) => {
              const rankColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];
              const rankColor = rankColors[i] ?? 'text-slate-500';
              return (
                <div
                  key={p.userId}
                  style={i === 0 ? {
                    background: 'linear-gradient(90deg, rgba(52,211,153,0.08) 0%, rgba(139,92,246,0.06) 100%)',
                  } : undefined}
                  className={`flex items-center justify-between px-5 py-3.5 ${i < top.length - 1 ? 'border-b border-white/5' : ''} transition-colors hover:bg-white/[0.04]`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className={`w-6 text-sm font-bold font-mono ${rankColor}`}>#{p.rank}</span>
                    <div className="relative">
                      <img
                        src={p.avatarUrl || `https://api.dicebear.com/8.x/bottts/svg?seed=${p.username}`}
                        alt={p.username}
                        className="w-9 h-9 rounded-full ring-1 ring-white/10"
                      />
                      {i === 0 && (
                        <span className="absolute -top-1.5 -right-1.5 text-[10px]">👑</span>
                      )}
                    </div>
                    <span className="font-semibold text-white/90">{p.username}</span>
                    <span className={`badge-${p.league} opacity-80`}>{p.league}</span>
                  </div>
                  <span
                    style={{ textShadow: '0 0 12px rgba(52,211,153,0.5)' }}
                    className="text-emerald-400 font-bold tabular-nums"
                  >
                    {p.rating}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {featuredContest && (
        <section className="max-w-2xl mx-auto w-full px-4 pb-16">
          <div
            className={`w-full rounded-2xl border p-4 backdrop-blur-xl ${featuredContest.status === 'live' ? 'border-red-500/40 bg-red-950/25' : 'border-yellow-500/30 bg-yellow-950/20'}`}
            style={{ animation: 'fadeInUp 0.75s ease-out both' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-xs font-bold mb-1 ${featuredContest.status === 'live' ? 'text-red-300' : 'text-yellow-300'}`}>
                  {featuredContest.status === 'live' ? '● Concurs LIVE acum' : '⏳ Concurs nou în așteptare'}
                </p>
                <p className="text-white font-semibold leading-tight">{featuredContest.name}</p>
                {featuredContest.description && (
                  <p className="text-slate-300/80 text-sm mt-1 line-clamp-2">{featuredContest.description}</p>
                )}
                <p className="text-slate-300/90 text-sm mt-2 font-medium">
                  Niv.{featuredContest?.rounds?.[0]?.minLevel ?? '-'}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  🕒 {new Date(featuredContest.startAt).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {' '}🏁 {new Date(featuredContest.endAt).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Înscriși</p>
                <p className="text-sm font-semibold text-white">
                  {featuredContest.registeredCount ?? 0}/{featuredContest.maxPlayers ?? '-'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/contest/${featuredContest.slug}`}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${featuredContest.status === 'live' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-yellow-600 hover:bg-yellow-500 text-white'}`}
              >
                {featuredContest.status === 'live' ? 'Joacă acum' : 'Vezi concurs'}
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="max-w-6xl mx-auto w-full px-4 pb-14">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Alege-ti jocul</h2>
          <span className="text-xs text-slate-400 uppercase tracking-wider">Multi-game platform</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {games.map((game) => {
            const meta: Record<string, { subtitle: string; accent: string; image?: string }> = {
              integrame: {
                subtitle: 'Dueluri pe definitii si viteza',
                accent: 'from-emerald-500/25 to-teal-500/10',
                image: '/Integrame.PNG',
              },
              labirinturi: {
                subtitle: 'Logica, orientare si decizii rapide',
                accent: 'from-violet-500/25 to-fuchsia-500/10',
                image: '/Labirinturi.PNG',
              },
            };
            const card = meta[game.id] ?? {
              subtitle: 'Provocari multiplayer pentru tine si prietenii tai',
              accent: 'from-sky-500/25 to-indigo-500/10',
            };

            return (
            <div
              key={game.id}
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                boxShadow: '0 18px 44px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
              className="group relative rounded-[28px] border border-white/10 backdrop-blur-xl overflow-hidden min-h-[420px] h-full flex flex-col"
            >
              <div className="relative h-[250px] xl:h-[280px] overflow-hidden shrink-0">
                {card.image ? (
                  <Image
                    src={card.image}
                    alt={game.label}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : null}

                {/* iOS-like frosted overlays */}
                <div className={`absolute inset-0 bg-gradient-to-b ${card.accent} pointer-events-none`} />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, rgba(2,6,23,0.05) 0%, rgba(2,6,23,0.50) 75%, rgba(2,6,23,0.9) 100%)' }}
                />
                <div
                  className="absolute top-3 left-3 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide text-emerald-200 border border-white/20 backdrop-blur-xl"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 14px rgba(0,0,0,0.3)',
                  }}
                >
                  <span className="inline-flex items-center gap-1.5"><Gamepad2 size={12} /> MOD ACTIV</span>
                </div>
              </div>

              <div className="relative p-6 flex-1 flex flex-col">
                <h3 className="text-2xl font-bold text-white leading-tight">{game.label}</h3>
                <p className="text-base text-slate-300/90 mt-2">{card.subtitle}</p>
                <Link
                  href={isLoggedIn ? `/dashboard?game=${game.id}` : '/register'}
                  className="inline-flex mt-auto items-center justify-center h-10 px-4 rounded-full text-sm font-semibold text-emerald-200 border border-emerald-300/25 bg-emerald-400/10 hover:bg-emerald-400/20 hover:text-emerald-100 transition w-fit"
                >
                  Joaca acest mod
                </Link>
              </div>
            </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
