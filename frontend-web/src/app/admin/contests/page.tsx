'use client';

/**
 * /admin/contests — Gestionare concursuri
 * ─────────────────────────────────────────
 * Admin features:
 *  - Lista tuturor concursurilor cu stats live (înscriși, online, status)
 *  - Creare concurs cu runde dinamice (label, gameType, minLevel, matchesCount)
 *  - Editare concurs
 *  - Ștergere concurs
 *  - Force start / force end
 *  - Vizualizare participanți cu scoruri pe runde, rank, istoricul scorurilor
 */

import { useEffect, useState, useCallback } from 'react';
import adminApi from '@/lib/adminApi';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RoundRow {
  id: string;
  order: number;
  label: string;
  gameType: string;
  minLevel: number;
  matchesCount: number;
}

interface ContestRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: string;
  status: string;
  startAt: string;
  endAt: string;
  maxPlayers: number | null;
  botsCount: number;
  createdBy: string;
  createdAt: string;
  registeredCount: number;
  onlineCount: number;
  rounds: RoundRow[];
}

interface PlayerRow {
  rank: number;
  userId: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  league: string;
  rating: number;
  xp: number;
  joinedAt: string;
  isOnline: boolean;
  totalScore: number;
  roundScores: Record<string, number>;
  matchesPlayed: number;
  scoreHistory: Array<{ roundId?: string; gameType: string; score: number; level?: number; timeTaken?: number; matchId?: string; createdAt: string }>;
}

interface ContestDetail {
  contest: { id: string; name: string; slug: string; status: string; startAt: string; endAt: string; maxPlayers: number | null; rounds: RoundRow[] };
  totalRegistered: number;
  onlineCount: number;
  players: PlayerRow[];
}

interface RoundForm {
  label: string;
  gameType: string;
  minLevel: number;
  matchesCount: number;
}

interface CreateForm {
  name: string;
  slug: string;
  description: string;
  type: 'public' | 'private';
  startAt: string;
  endAt: string;
  maxPlayers: string;
  botsCount: string;
  rounds: RoundForm[];
}

const EMPTY_ROUND: RoundForm = { label: '', gameType: 'labirinturi', minLevel: 1, matchesCount: 1 };

const EMPTY_FORM: CreateForm = {
  name: '', slug: '', description: '',
  type: 'public',
  startAt: '', endAt: '',
  maxPlayers: '',
  botsCount: '0',
  rounds: [{ ...EMPTY_ROUND }],
};

// GAME_OPTIONS se încarcă dinamic din API — nu sunt hardcodate
const GAME_LABELS: Record<string, string> = {
  integrame: '🧩 Integrame',
  labirinturi: '🌀 Labirinturi',
  slogane: '💬 Slogane',
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  waiting: { label: '⏳ În așteptare', cls: 'bg-yellow-900/30 text-yellow-300 border border-yellow-700' },
  live:    { label: '🔴 LIVE',         cls: 'bg-red-900/30 text-red-300 border border-red-700' },
  ended:   { label: '✅ Încheiat',      cls: 'bg-gray-700 text-gray-300' },
};
const LEAGUE_COLORS: Record<string, string> = {
  bronze:   'text-amber-500',
  silver:   'text-gray-400',
  gold:     'text-yellow-400',
  platinum: 'text-cyan-400',
  diamond:  'text-blue-400',
};

// Converts a Date object → "YYYY-MM-DDTHH:mm" in the browser's LOCAL timezone
// (the value format required by <input type="datetime-local">)
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStartAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return toLocalInputValue(d);
}
function defaultEndAt() {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  d.setHours(22, 0, 0, 0);
  return toLocalInputValue(d);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function AdminContestsPage() {
  const [contests, setContests] = useState<ContestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [gameOptions, setGameOptions] = useState<string[]>(['integrame', 'labirinturi', 'slogane']);

  const fetchContests = useCallback(async () => {
    try {
      const { data } = await adminApi.get('/api/admin/contests');
      setContests(data.contests);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  // Încarcă tipurile de jocuri disponibile din API (nu hardcodate)
  useEffect(() => {
    adminApi.get('/api/admin/scoring-configs')
      .then(({ data }) => {
        const types: string[] = (data.configs ?? []).map((c: { gameType: string }) => c.gameType);
        if (types.length > 0) setGameOptions(types);
      })
      .catch(() => { /* fallback la valorile default */ });
  }, []);

  useEffect(() => { fetchContests(); }, [fetchContests]);

  // Refresh every 15s pentru online count live
  useEffect(() => {
    const id = setInterval(fetchContests, 15_000);
    return () => clearInterval(id);
  }, [fetchContests]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const { data } = await adminApi.get(`/api/admin/contests/${id}/players`);
      setDetail(data);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }, []);

  // ── Create / Update ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.startAt || !form.endAt || form.rounds.length === 0) {
      setFormError('Completează toate câmpurile obligatorii (*, Runde).');
      return;
    }
    if (form.rounds.some(r => !r.label.trim() || !r.gameType)) {
      setFormError('Fiecare rundă trebuie să aibă un label și un tip de joc.');
      return;
    }
    if (new Date(form.endAt) <= new Date(form.startAt)) {
      setFormError('Data de final trebuie să fie după data de start.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description,
        type: form.type,
        // Convert local browser time → UTC ISO before sending to backend
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
        maxPlayers: form.maxPlayers ? Number(form.maxPlayers) : null,
        botsCount: Number(form.botsCount) || 0,
        rounds: form.rounds.map((r, i) => ({ order: i + 1, label: r.label, gameType: r.gameType, minLevel: r.minLevel, matchesCount: r.matchesCount })),
      };
      if (editingId) {
        await adminApi.patch(`/api/admin/contests/${editingId}`, payload);
      } else {
        await adminApi.post('/api/admin/contests', payload);
      }
      setShowCreate(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await fetchContests();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e.response?.data?.error ?? 'Eroare la salvare.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: ContestRow) => {
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description,
      type: c.type as 'public' | 'private',
      // Convert UTC from server → local browser time for datetime-local input
      startAt: toLocalInputValue(new Date(c.startAt)),
      endAt: toLocalInputValue(new Date(c.endAt)),
      maxPlayers: c.maxPlayers != null ? String(c.maxPlayers) : '',
      botsCount: String(c.botsCount ?? 0),
      rounds: c.rounds.map(r => ({ label: r.label, gameType: r.gameType, minLevel: r.minLevel, matchesCount: r.matchesCount })),
    });
    setEditingId(c.id);
    setShowCreate(true);
    setFormError('');
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Ștergi concursul "${name}"? Toți participanții și scorurile vor fi șterse.`)) return;
    try {
      await adminApi.delete(`/api/admin/contests/${id}`);
      await fetchContests();
      if (detail?.contest.id === id) setDetail(null);
    } catch { alert('Eroare la ștergere.'); }
  };

  const handleForceStart = async (id: string) => {
    try { await adminApi.post(`/api/admin/contests/${id}/force-start`); await fetchContests(); }
    catch { alert('Eroare force-start.'); }
  };

  const handleForceEnd = async (id: string) => {
    if (!confirm('Oprești forțat concursul?')) return;
    try { await adminApi.post(`/api/admin/contests/${id}/force-end`); await fetchContests(); }
    catch { alert('Eroare force-end.'); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">🏆 Gestionare Concursuri</h1>
          <p className="text-gray-400 text-sm mt-1">Crează și administrează concursuri/turnee pentru jucători.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); setForm({ ...EMPTY_FORM, startAt: defaultStartAt(), endAt: defaultEndAt() }); setFormError(''); }}
          className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm"
        >
          + Concurs nou
        </button>
      </div>

      {/* ── Create / Edit Form ──────────────────────────────────────────────── */}
      {showCreate && (
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 space-y-5">
          <h2 className="font-bold text-white text-lg">{editingId ? 'Editează concursul' : 'Concurs nou'}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nume *">
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                placeholder="ex: Campionatul de Primăvară"
                value={form.name}
                onChange={e => {
                  const n = e.target.value;
                  setForm(f => ({ ...f, name: n, slug: editingId ? f.slug : slugify(n) }));
                }}
              />
            </Field>
            <Field label="Slug * (URL)">
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
                placeholder="ex: campionat-primavara"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
              />
            </Field>
          </div>

          <Field label="Descriere">
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none"
              rows={2}
              placeholder="Descriere opțională..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Tip">
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as 'public' | 'private' }))}
              >
                <option value="public">🌍 Public</option>
                <option value="private">🔒 Privat</option>
              </select>
            </Field>
            <Field label="Start * (dată + oră)">
              <input
                type="datetime-local"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={form.startAt}
                onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
              />
              {form.startAt && (() => {
                const d = new Date(form.startAt);
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                return (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-xs text-gray-400">
                      🌍 <span className="text-orange-400 font-mono">{tz}</span>
                      {' — '}{d.toLocaleString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-gray-600">
                      UTC: {d.toISOString().replace('T', ' ').slice(0, 16)}
                    </p>
                  </div>
                );
              })()}
            </Field>
            <Field label="Final * (dată + oră)">
              <input
                type="datetime-local"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={form.endAt}
                onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
              />
              {form.endAt && (() => {
                const d = new Date(form.endAt);
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                return (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-xs text-gray-400">
                      🌍 <span className="text-orange-400 font-mono">{tz}</span>
                      {' — '}{d.toLocaleString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-gray-600">
                      UTC: {d.toISOString().replace('T', ' ').slice(0, 16)}
                    </p>
                  </div>
                );
              })()}
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Max jucători (gol = nelimitat)">
              <input
                type="number"
                min="1"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                placeholder="ex: 100"
                value={form.maxPlayers}
                onChange={e => setForm(f => ({ ...f, maxPlayers: e.target.value }))}
              />
            </Field>
            <Field label="Boți auto-înscriși la start (0 = fără boți)">
              <input
                type="number"
                min="0"
                max="50"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                placeholder="ex: 5"
                value={form.botsCount}
                onChange={e => setForm(f => ({ ...f, botsCount: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">Boții SIMULATED vor fi înregistrați automat când concursul devine LIVE</p>
            </Field>
          </div>

          {/* ── Rounds Editor ───────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 uppercase tracking-wider">Runde *</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, rounds: [...f.rounds, { ...EMPTY_ROUND }] }))}
                className="text-xs bg-violet-700 hover:bg-violet-600 text-white px-3 py-1 rounded-lg transition-colors font-medium"
              >
                + Adaugă rundă
              </button>
            </div>
            <div className="space-y-3">
              {form.rounds.map((r, i) => (
                <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-violet-400 w-8">#{i + 1}</span>
                    <input
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm"
                      placeholder="Label rundă (ex: Runda 1, Finală)"
                      value={r.label}
                      onChange={e => setForm(f => {
                        const rounds = [...f.rounds];
                        rounds[i] = { ...rounds[i], label: e.target.value };
                        return { ...f, rounds };
                      })}
                    />
                    {form.rounds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, rounds: f.rounds.filter((_, j) => j !== i) }))}
                        className="text-red-400 hover:text-red-300 text-sm px-2"
                        title="Șterge runda"
                      >✕</button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Tip joc</label>
                      <select
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                        value={r.gameType}
                        onChange={e => setForm(f => {
                          const rounds = [...f.rounds];
                          rounds[i] = { ...rounds[i], gameType: e.target.value };
                          return { ...f, rounds };
                        })}
                      >
                        {gameOptions.map(gt => (
                          <option key={gt} value={gt}>{GAME_LABELS[gt] ?? gt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Nivel (dificultate)</label>
                      <select
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                        value={r.minLevel}
                        onChange={e => setForm(f => {
                          const rounds = [...f.rounds];
                          rounds[i] = { ...rounds[i], minLevel: Number(e.target.value) };
                          return { ...f, rounds };
                        })}
                      >
                        {[1, 2, 3, 4, 5].map(l => (
                          <option key={l} value={l}>
                            Nivel {l} {l === 1 ? '— 9×9 (simplu)' : l === 2 ? '— 11×11' : l === 3 ? '— 13×13 (mediu)' : l === 4 ? '— 15×15' : '— 17×17 (avansat)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Top N meciuri</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                        title="Cele mai bune N meciuri contează la scor"
                        value={r.matchesCount}
                        onChange={e => setForm(f => {
                          const rounds = [...f.rounds];
                          rounds[i] = { ...rounds[i], matchesCount: Math.max(1, Number(e.target.value)) };
                          return { ...f, rounds };
                        })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Fiecare rondă se joacă <strong>exact la nivelul specificat</strong>. Jucătorii vor fi dirițați automat la meciuri de acel nivel.
              Cele mai bune <em>N meciuri</em> contează la scor total.
            </p>
          </div>

          {/* Preview URL */}
          {form.slug && (
            <p className="text-xs text-gray-500">
              URL public: <span className="text-violet-400 font-mono">/contest/{form.slug}</span>
            </p>
          )}

          {formError && <p className="text-red-400 text-sm">{formError}</p>}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm"
            >
              {saving ? 'Salvez...' : editingId ? 'Salvează modificările' : 'Creează concursul'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setEditingId(null); setForm({ ...EMPTY_FORM, startAt: defaultStartAt(), endAt: defaultEndAt() }); setFormError(''); }}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* ── Contests List ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Se încarcă...</div>
      ) : contests.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">🏆</p>
          <p>Nu există concursuri deocamdată.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {contests.map(c => {
            const sm = STATUS_META[c.status] ?? STATUS_META.waiting;
            const isOpen = detail?.contest.id === c.id;
            return (
              <div key={c.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                {/* Main row */}
                <div className="p-5 flex flex-col md:flex-row md:items-center gap-4">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-bold text-white text-base">{c.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
                      <span className="text-xs text-gray-600 font-mono">{c.slug}</span>
                      {c.type === 'private' && <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">🔒 Privat</span>}
                    </div>
                    {c.description && <p className="text-gray-400 text-xs mt-1 truncate">{c.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.rounds.map(r => (
                        <span key={r.id} className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded">
                          <span className="text-gray-500 mr-1">#{r.order}</span>
                          {r.label || (GAME_LABELS[r.gameType] ?? r.gameType)}
                          <span className={`ml-1 text-xs ${r.minLevel >= 4 ? 'text-red-400' : r.minLevel >= 3 ? 'text-yellow-500' : 'text-gray-500'}`}>Niv.{r.minLevel}</span>
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                      <span>🕒 {fmtDate(c.startAt)}</span>
                      <span>🏁 {fmtDate(c.endAt)}</span>
                    </div>
                  </div>

                  {/* Middle: stats */}
                  <div className="flex gap-5">
                    <StatBox
                      label="Înscriși"
                      value={<span>{c.registeredCount}{c.maxPlayers ? <span className="text-gray-600 text-xs">/{c.maxPlayers}</span> : ''}</span>}
                    />
                    <StatBox
                      label="Online"
                      value={<span className={c.onlineCount > 0 ? 'text-green-400' : 'text-gray-600'}>{c.onlineCount}</span>}
                    />
                    {c.maxPlayers && (
                      <StatBox
                        label="Ocupat"
                        value={<span>{Math.round((c.registeredCount / c.maxPlayers) * 100)}%</span>}
                      />
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Force start/end */}
                    {c.status === 'waiting' && (
                      <button
                        onClick={() => handleForceStart(c.id)}
                        className="text-xs bg-red-900/40 hover:bg-red-800/50 text-red-300 border border-red-700 px-3 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        ▶ Force Start
                      </button>
                    )}
                    {c.status === 'live' && (
                      <button
                        onClick={() => handleForceEnd(c.id)}
                        className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 px-3 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        ⏹ Force End
                      </button>
                    )}

                    {/* Participanți */}
                    <button
                      onClick={() => {
                        if (isOpen) { setDetail(null); } else { fetchDetail(c.id); }
                      }}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
                    >
                      👥 {isOpen ? 'Ascunde' : 'Participanți'}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => handleEdit(c)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      ✏️
                    </button>

                    {/* Link public */}
                    <a
                      href={`/contest/${c.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                      title="Deschide pagina publică"
                    >
                      🔗
                    </a>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      className="text-xs bg-red-900/30 hover:bg-red-800/40 text-red-400 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {c.maxPlayers && (
                  <div className="h-1 bg-gray-800">
                    <div
                      className="h-full bg-violet-600 transition-all duration-500"
                      style={{ width: `${Math.min(100, (c.registeredCount / c.maxPlayers) * 100)}%` }}
                    />
                  </div>
                )}

                {/* ── Players Panel ───────────────────────────────────────────────── */}
                {isOpen && (
                  <div className="border-t border-gray-800 bg-gray-950">
                    {detailLoading ? (
                      <div className="text-center py-8 text-gray-500 text-sm">Se încarcă participanții...</div>
                    ) : detail && (
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-sm text-gray-400">
                            <span className="text-white font-bold">{detail.totalRegistered}</span> participanți înscriși
                            {detail.onlineCount > 0 && (
                              <span className="ml-2 text-green-400 font-semibold">
                                ● {detail.onlineCount} online acum
                              </span>
                            )}
                          </p>
                        </div>

                        {detail.players.length === 0 ? (
                          <p className="text-gray-500 text-sm text-center py-4">Niciun participant înscris.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-gray-800">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-500 border-b border-gray-800 uppercase tracking-wider bg-gray-900">
                                  <th className="py-2 px-3 text-left w-8">#</th>
                                  <th className="py-2 px-3 text-left">Jucător</th>
                                  <th className="py-2 px-3 text-right">ELO</th>
                                  {detail.contest.rounds.map(r => (
                                    <th key={r.id} className="py-2 px-3 text-right hidden md:table-cell whitespace-nowrap">
                                      <span className="text-gray-600 mr-1">#{r.order}</span>
                                      {r.label || (GAME_LABELS[r.gameType] ?? r.gameType)}
                                    </th>
                                  ))}
                                  <th className="py-2 px-3 text-right font-bold">Total</th>
                                  <th className="py-2 px-3 text-right">Meciuri</th>
                                  <th className="py-2 px-3 text-right">Înscris</th>
                                  <th className="py-2 px-3 text-center">Status</th>
                                  <th className="py-2 px-3 text-center">Istoric</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.players.map(p => {
                                  const isExpanded = expandedPlayer === p.userId;
                                  return (
                                    <>
                                      <tr key={p.userId} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                                        <td className="py-2.5 px-3 font-bold text-gray-400">{p.rank}</td>
                                        <td className="py-2.5 px-3">
                                          <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">
                                              {p.username[0]?.toUpperCase()}
                                            </div>
                                            <div>
                                              <p className="text-white font-semibold text-xs">{p.username}</p>
                                              <p className="text-gray-500 text-xs">{p.email}</p>
                                            </div>
                                          </div>
                                        </td>
                                        <td className={`py-2.5 px-3 text-right font-mono text-xs ${LEAGUE_COLORS[p.league]}`}>
                                          {p.rating}
                                        </td>
                                        {detail.contest.rounds.map(r => (
                                          <td key={r.id} className="py-2.5 px-3 text-right hidden md:table-cell text-gray-300 font-mono text-xs">
                                            {p.roundScores[r.id] != null && p.roundScores[r.id] > 0
                                              ? p.roundScores[r.id].toLocaleString()
                                              : <span className="text-gray-600">—</span>}
                                          </td>
                                        ))}
                                        <td className="py-2.5 px-3 text-right font-bold font-mono text-white">
                                          {p.totalScore.toLocaleString()}
                                        </td>
                                        <td className="py-2.5 px-3 text-right text-gray-400 text-xs">{p.matchesPlayed}</td>
                                        <td className="py-2.5 px-3 text-right text-gray-500 text-xs whitespace-nowrap">
                                          {new Date(p.joinedAt).toLocaleDateString('ro-RO')}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                          {p.isOnline
                                            ? <span className="text-xs text-green-400 font-semibold">● online</span>
                                            : <span className="text-xs text-gray-600">offline</span>
                                          }
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                          {p.scoreHistory.length > 0 && (
                                            <button
                                              onClick={() => setExpandedPlayer(isExpanded ? null : p.userId)}
                                              className="text-xs text-violet-400 hover:text-violet-300"
                                            >
                                              {isExpanded ? '▲ ascunde' : `▼ ${p.scoreHistory.length} scoruri`}
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                      {/* Score history row */}
                                      {isExpanded && (
                                        <tr key={`${p.userId}-hist`} className="bg-gray-900/60">
                                          <td colSpan={6 + detail.contest.rounds.length} className="px-6 py-3">
                                            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Istoricul scorurilor</p>
                                            <div className="space-y-1">
                                              {p.scoreHistory.map((s, i) => {
                                                const round = detail.contest.rounds.find(r => r.id === s.roundId);
                                                return (
                                                  <div key={i} className="flex items-center gap-3 text-xs">
                                                    <span className="text-gray-500 w-32">{new Date(s.createdAt).toLocaleString('ro-RO')}</span>
                                                    {round && <span className="text-violet-400">{round.label || `Runda ${round.order}`}</span>}
                                                    <span className="text-gray-300">{GAME_LABELS[s.gameType] ?? s.gameType}</span>
                                                    {s.level != null && <span className="text-yellow-600 text-xs">Niv {s.level}</span>}
                                                    <span className="font-bold text-white font-mono">{s.score.toLocaleString()} pts</span>
                                                    {s.timeTaken && <span className="text-gray-500">{s.timeTaken}s</span>}
                                                    {s.matchId && (
                                                      <span className="text-gray-600 font-mono text-xs">{s.matchId.slice(0, 8)}…</span>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helper components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-center min-w-[50px]">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
