'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { premiumRoomsApi, PremiumRoundConfig, gamesApi } from '@/lib/api';
import Navbar from '@/components/Navbar';
import { Plus, Trash2, ChevronDown, Calendar } from 'lucide-react';

type GameOption = { id: string; name: string; emoji?: string; maxLevel: number };

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: '🟢 Ușor',
  medium: '🟡 Mediu',
  hard: '🔴 Greu',
};

const DEFAULT_ROUND: PremiumRoundConfig = {
  gameType: 'integrame',
  level: 1,
  difficulty: 'medium',
  timeLimit: 180,
};

export default function CreatePremiumRoomPage() {
  const router = useRouter();
  const { user, _hasHydrated, token } = useAuthStore();
  const [games, setGames] = useState<GameOption[]>([]);
  const [mode, setMode] = useState<'quick' | 'tournament'>('quick');
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [allowSpectators, setAllowSpectators] = useState(false);
  const [rounds, setRounds] = useState<PremiumRoundConfig[]>([{ ...DEFAULT_ROUND }]);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('20:00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) { router.push('/login'); return; }
    if (user && (user as any).plan !== 'premium') { router.push('/premium-room'); return; }

    // Încărcăm jocurile disponibile din API — game-agnostic
    gamesApi.getAll().then((r) => {
      const raw: any[] = r.data?.games ?? r.data ?? [];
      const options: GameOption[] = raw
        .filter((g: any) => g.isActive !== false)
        .map((g: any) => ({
          id: g.id === 'maze' ? 'labirinturi' : g.id,
          name: g.name ?? g.id,
          emoji: g.emoji,
          maxLevel: g.maxLevel ?? 5,
        }));
      if (options.length > 0) {
        setGames(options);
        setRounds([{ ...DEFAULT_ROUND, gameType: options[0].id }]);
      }
    }).catch(() => {});
  }, [_hasHydrated, token, user]);

  const addRound = () => {
    setRounds((prev) => [...prev, { ...DEFAULT_ROUND, gameType: games[0]?.id ?? 'integrame' }]);
  };

  const removeRound = (idx: number) => {
    setRounds((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRound = (idx: number, patch: Partial<PremiumRoundConfig>) => {
    setRounds((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const maxLevelFor = (gameType: string) => games.find((g) => g.id === gameType)?.maxLevel ?? 5;

  const handleCreate = async () => {
    setError('');
    setLoading(true);
    try {
      const startAt = scheduleEnabled && scheduleDate
        ? new Date(`${scheduleDate}T${scheduleTime || '20:00'}:00`).toISOString()
        : undefined;
      const res = await premiumRoomsApi.create({ name: name.trim() || undefined, mode, maxPlayers, allowSpectators, rounds, startAt });
      router.push(`/premium-room/${res.data.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.response?.data?.error ?? 'Eroare la creare.');
    } finally {
      setLoading(false);
    }
  };

  if (!_hasHydrated) return null;

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-xs text-slate-400 hover:text-white mb-3">
            ← Înapoi
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            💎 Crează cameră privată
          </h1>
          <p className="text-slate-400 text-sm mt-1">Invită până la 8 prieteni, alege orice joc disponibil.</p>
        </div>

        <div className="space-y-5">
          {/* Mod */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Mod de joc</h3>
            <div className="flex gap-3">
              {(['quick', 'tournament'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-3 rounded-xl font-semibold text-sm border transition-colors ${
                    mode === m
                      ? 'border-amber-400/60 bg-amber-400/15 text-amber-200'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {m === 'quick' ? '⚡ Quick Match' : '🏆 Turneu'}
                </button>
              ))}
            </div>
            {mode === 'tournament' && (
              <p className="text-xs text-slate-400 mt-2">
                Multiple runde, fiecare cu joc și dificultate diferite. Scor cumulativ.
              </p>
            )}
          </div>

          {/* Setări generale */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Setări generale</h3>

            {/* Nume opțional */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nume cameră <span className="text-slate-600">(opțional)</span></label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={40}
                placeholder="ex. Finala Joi Seară"
                className="input text-sm bg-slate-800 border-slate-600 text-white rounded-xl w-full"
              />
              {name.trim() && (
                <p className="text-xs text-amber-300/70 mt-1">Va apărea ca: <span className="font-bold uppercase">{name.trim().toUpperCase()}</span></p>
              )}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Max jucători</label>
                <div className="relative">
                  <select
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="input appearance-none pr-7 text-sm bg-slate-800 border-slate-600 text-white rounded-xl"
                  >
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>{n} jucători</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input
                  type="checkbox"
                  checked={allowSpectators}
                  onChange={(e) => setAllowSpectators(e.target.checked)}
                  className="w-4 h-4 accent-amber-400"
                />
                <span className="text-slate-300">Permite spectatori</span>
              </label>
            </div>
          </div>

          {/* Runde */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-300">
                {mode === 'quick' ? 'Setări joc' : `Runde (${rounds.length})`}
              </h3>
              {mode === 'tournament' && (
                <button
                  onClick={addRound}
                  disabled={rounds.length >= 20}
                  className="flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-100 disabled:opacity-40"
                >
                  <Plus size={14} /> Adaugă rundă
                </button>
              )}
            </div>
            <div className="space-y-3">
              {rounds.map((round, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
                >
                  {mode === 'tournament' && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300">Runda {idx + 1}</span>
                      {rounds.length > 1 && (
                        <button onClick={() => removeRound(idx)}
                          className="text-red-400 hover:text-red-300">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Joc — dinamic din API */}
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Joc</label>
                      <div className="relative">
                        <select
                          value={round.gameType}
                          onChange={(e) => updateRound(idx, {
                            gameType: e.target.value,
                            level: 1,
                          })}
                          className="input appearance-none pr-7 text-sm bg-slate-800 border-slate-600 text-white rounded-xl w-full"
                        >
                          {games.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.emoji ? `${g.emoji} ` : ''}{g.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    {/* Nivel */}
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Nivel</label>
                      <div className="relative">
                        <select
                          value={round.level}
                          onChange={(e) => updateRound(idx, { level: Number(e.target.value) })}
                          className="input appearance-none pr-7 text-sm bg-slate-800 border-slate-600 text-white rounded-xl w-full"
                        >
                          {Array.from({ length: maxLevelFor(round.gameType) }, (_, i) => i + 1).map((l) => (
                            <option key={l} value={l}>Nivel {l}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    {/* Dificultate */}
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Dificultate</label>
                      <div className="relative">
                        <select
                          value={round.difficulty}
                          onChange={(e) => updateRound(idx, { difficulty: e.target.value as any })}
                          className="input appearance-none pr-7 text-sm bg-slate-800 border-slate-600 text-white rounded-xl w-full"
                        >
                          {Object.entries(DIFFICULTY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    {/* Timp */}
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Timp (secunde)</label>
                      <input
                        type="number"
                        min={30}
                        max={3600}
                        step={30}
                        value={round.timeLimit}
                        onChange={(e) => updateRound(idx, { timeLimit: Number(e.target.value) })}
                        className="input text-sm bg-slate-800 border-slate-600 text-white rounded-xl w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Programare */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-300">Programare (opțional)</h3>
              </div>
              <button
                type="button"
                onClick={() => setScheduleEnabled(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  scheduleEnabled ? 'bg-amber-400' : 'bg-slate-600'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  scheduleEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {scheduleEnabled && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-400">
                  Camera se creează acum, dar jocul pornește la data și ora aleasă. Prietenii pot intra oricând înainte.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-slate-400 mb-1 block">Data</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setScheduleDate(e.target.value)}
                      className="input text-sm bg-slate-800 border-slate-600 text-white rounded-xl w-full"
                    />
                  </div>
                  <div className="w-36">
                    <label className="text-xs text-slate-400 mb-1 block">Ora</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="input text-sm bg-slate-800 border-slate-600 text-white rounded-xl w-full"
                    />
                  </div>
                </div>
                {scheduleDate && (
                  <p className="text-xs text-amber-300/80">
                    ⏰ Jocul va porni {new Date(`${scheduleDate}T${scheduleTime}:00`).toLocaleString('ro-RO', {
                      weekday: 'long', day: 'numeric', month: 'long',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={loading || rounds.length === 0}
            className="w-full py-3.5 rounded-2xl font-bold text-base bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:brightness-110 transition disabled:opacity-60 shadow-lg shadow-amber-500/25"
          >
            {loading ? 'Se creează...' : '💎 Creează camera'}
          </button>
        </div>
      </main>
    </>
  );
}
