'use client';

import { useEffect, useState, useCallback } from 'react';
import adminApi from '@/lib/adminApi';

// ─── Types — Scoring per joc ──────────────────────────────────────────────────
interface DefaultRules {
  pointsPerCorrect: number;
  pointsPerMistake: number;
  bonusFirstFinisher: number;
  bonusCompletion: number;
  timeLimit: number;  // seconds (from code)
  forfeitBonus: number;
}

interface ScoringOverride {
  id: string;
  level: number | null;
  pointsPerCorrect: number | null;
  pointsPerMistake: number | null;
  bonusFirstFinisher: number | null;
  bonusCompletion: number | null;
  timeLimitSeconds: number | null;
  forfeitBonus: number | null;
  updatedBy: string | null;
  updatedAt: string;
}

interface GameConfig {
  gameType: string;
  name: string;
  icon: string;
  primaryColor: string;
  defaultRules: DefaultRules;
  availableLevels: number[];
  overrides: ScoringOverride[];
}

// ─── Field definitions ─────────────────────────────────────────────────────────
const FIELDS: Array<{ key: keyof EditForm; label: string; unit: string; hint: string }> = [
  { key: 'pointsPerCorrect',   label: 'Puncte / răspuns corect', unit: 'pts',  hint: 'Pozitiv' },
  { key: 'pointsPerMistake',   label: 'Puncte / greșeală',       unit: 'pts',  hint: 'Negativ = penalizare' },
  { key: 'bonusFirstFinisher', label: 'Bonus primul finisher',   unit: 'pts',  hint: '' },
  { key: 'bonusCompletion',    label: 'Bonus completare',        unit: 'pts',  hint: '' },
  { key: 'timeLimitSeconds',   label: 'Timp limită',             unit: 'sec',  hint: 'Minim 10s' },
  { key: 'forfeitBonus',       label: 'Bonus forfeit',           unit: 'pts',  hint: 'Când adversarul abandonează' },
];

interface EditForm {
  pointsPerCorrect: string;
  pointsPerMistake: string;
  bonusFirstFinisher: string;
  bonusCompletion: string;
  timeLimitSeconds: string;
  forfeitBonus: string;
}

function emptyForm(): EditForm {
  return { pointsPerCorrect: '', pointsPerMistake: '', bonusFirstFinisher: '', bonusCompletion: '', timeLimitSeconds: '', forfeitBonus: '' };
}

function overrideToForm(override: ScoringOverride): EditForm {
  return {
    pointsPerCorrect:   override.pointsPerCorrect   !== null ? String(override.pointsPerCorrect)   : '',
    pointsPerMistake:   override.pointsPerMistake   !== null ? String(override.pointsPerMistake)   : '',
    bonusFirstFinisher: override.bonusFirstFinisher !== null ? String(override.bonusFirstFinisher) : '',
    bonusCompletion:    override.bonusCompletion    !== null ? String(override.bonusCompletion)    : '',
    timeLimitSeconds:   override.timeLimitSeconds   !== null ? String(override.timeLimitSeconds)   : '',
    forfeitBonus:       override.forfeitBonus       !== null ? String(override.forfeitBonus)       : '',
  };
}

function defaultsToForm(defaults: DefaultRules): EditForm {
  return {
    pointsPerCorrect:   String(defaults.pointsPerCorrect),
    pointsPerMistake:   String(defaults.pointsPerMistake),
    bonusFirstFinisher: String(defaults.bonusFirstFinisher),
    bonusCompletion:    String(defaults.bonusCompletion),
    timeLimitSeconds:   String(defaults.timeLimit),
    forfeitBonus:       String(defaults.forfeitBonus),
  };
}

function formToPayload(form: EditForm): Record<string, number> {
  const payload: Record<string, number> = {};
  for (const { key } of FIELDS) {
    const v = form[key].trim();
    if (v !== '') payload[key] = Number(v);
  }
  return payload;
}

// ─── Types — Bonus Challenges ─────────────────────────────────────────────────
interface BonusChallenge {
  id: string;
  gameType: string;
  challengeType: string;
  label: string;
  requiredValue: number;
  bonusPoints: number;
  isActive: boolean;
  description: string;
  icon: string;
  awardsCount: number;
  createdAt: string;
}

interface ChallengeTypeDef {
  type: string;
  label: string;
  icon: string;
}

// ─── Types — System config ────────────────────────────────────────────────────
interface EloConfig {
  kFactorLow: number; kFactorMid: number; kFactorHigh: number;
  thresholdMid: number; thresholdHigh: number;
}
interface XpConfig { perWin: number; perLoss: number; perDraw: number; bonusTop3: number; }
interface LeagueConfig { silver: number; gold: number; platinum: number; diamond: number; }
interface UiConfig { aiAssistantEnabled: boolean; }
interface SystemConfigLimits {
  elo: { kFactor: { min: number; max: number }; threshold: { min: number; max: number } };
  xp: { perWin: { min: number; max: number }; perLoss: { min: number; max: number }; perDraw: { min: number; max: number }; bonusTop3: { min: number; max: number } };
  league: { rating: { min: number; max: number } };
}
interface SystemConfigData {
  elo: EloConfig; xp: XpConfig; league: LeagueConfig; ui: UiConfig;
  defaults: { elo: EloConfig; xp: XpConfig; league: LeagueConfig; ui: UiConfig };
  limits: SystemConfigLimits;
}

// ─── Types — Level config ─────────────────────────────────────────────────────
interface LevelConfig {
  id: string;
  gameType: string;
  level: number;
  displayName: string;
  difficultyValue: number;
  isActive: boolean;
  maxPlayers: number;
  winsToUnlock: number;
  gamesPerLevel: number;
  matchCount: number;
  updatedBy: string | null;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [configs, setConfigs] = useState<GameConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // System config — ELO / XP / Ligi
  const [sysConfig, setSysConfig] = useState<SystemConfigData | null>(null);
  const [sysLoadErr, setSysLoadErr] = useState(false);

  // Level configs per game
  const [levelConfigs, setLevelConfigs] = useState<Record<string, LevelConfig[]>>({});

  // Bonus challenges per game (key = gameType)
  const [bonusChallenges, setBonusChallenges] = useState<BonusChallenge[]>([]);
  const [challengeTypes, setChallengeTypes] = useState<ChallengeTypeDef[]>([]);

  // Active tab: gameType or 'global'
  const [activeTab, setActiveTab] = useState<string>('');

  // Which edit panel is open: key = "gameType:level" or "gameType:new"
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm());
  const [newLevelInput, setNewLevelInput] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scoringRes, sysRes, bonusRes] = await Promise.all([
        adminApi.get('/api/admin/scoring-configs'),
        adminApi.get('/api/admin/system-config'),
        adminApi.get('/api/admin/bonus-challenges'),
      ]);
      setConfigs(scoringRes.data.configs);
      setSysConfig(sysRes.data);
      setActiveTab((prev) => prev || scoringRes.data.configs[0]?.gameType || 'global');
      setBonusChallenges(bonusRes.data.challenges);
      setChallengeTypes(bonusRes.data.challengeTypes);
      // Încarcă level configs pentru fiecare joc
      const gameTypes: string[] = scoringRes.data.configs.map((g: GameConfig) => g.gameType);
      const lvlResponses = await Promise.all(
        gameTypes.map((gt: string) => adminApi.get(`/api/admin/level-configs/${gt}`))
      );
      const lvlMap: Record<string, LevelConfig[]> = {};
      for (const r of lvlResponses) {
        lvlMap[r.data.gameType] = r.data.levels;
      }
      setLevelConfigs(lvlMap);
      setSysLoadErr(false);
    } catch {
      showToast('Eroare la încărcare', 'err');
      setSysLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // Open edit panel for existing override
  function openEdit(gameType: string, override: ScoringOverride) {
    setEditing(`${gameType}:${override.level ?? 'base'}`);
    setForm(overrideToForm(override));
  }

  // Open edit panel to create new level override or base override
  function openNew(game: GameConfig, level: number | null) {
    const key = level === null ? `${game.gameType}:base` : `${game.gameType}:${level}`;
    setEditing(key);
    setForm(defaultsToForm(game.defaultRules));
    setNewLevelInput(level !== null ? String(level) : '');
  }

  function closeEdit() {
    setEditing(null);
    setForm(emptyForm());
    setNewLevelInput('');
  }

  async function handleSave(gameType: string, level: number | null) {
    setSaving(true);
    try {
      const payload = formToPayload(form);
      await adminApi.patch(`/api/admin/scoring-configs/${gameType}`, { level, ...payload });
      showToast('Salvat cu succes ✓');
      closeEdit();
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare la salvare';
      showToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(gameType: string, level: number | null) {
    if (!confirm(`Resetezi override-ul ${level !== null ? `nivel ${level}` : 'de bază'} la valorile default din cod?`)) return;
    try {
      const params = level !== null ? `?level=${level}` : '';
      await adminApi.delete(`/api/admin/scoring-configs/${gameType}${params}`);
      showToast('Reset la default ✓');
      await load();
    } catch {
      showToast('Eroare la reset', 'err');
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>⏳</span> Se încarcă...
      </div>
    );
  }

  const effectiveTab = activeTab || configs[0]?.gameType || 'global';

  return (
    <div style={{ padding: '32px 40px', width: '100%', maxWidth: '100%', position: 'relative', boxSizing: 'border-box' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 32, zIndex: 999,
          background: toast.type === 'ok' ? '#065f46' : '#7f1d1d',
          color: '#fff', padding: '12px 20px', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', fontSize: 14,
          border: `1px solid ${toast.type === 'ok' ? '#10b981' : '#ef4444'}`,
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>⚙️ Setări Admin</h1>
      </div>

      {/* ─── Tab bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2d3748', marginBottom: 32 }}>
        {configs.map((game) => (
          <button
            key={game.gameType}
            onClick={() => setActiveTab(game.gameType)}
            style={{
              padding: '9px 22px', fontSize: 14, background: 'transparent', border: 'none',
              borderBottom: effectiveTab === game.gameType ? `2px solid ${game.primaryColor}` : '2px solid transparent',
              color: effectiveTab === game.gameType ? game.primaryColor : '#64748b',
              fontWeight: effectiveTab === game.gameType ? 700 : 500,
              cursor: 'pointer', marginBottom: -1, transition: 'all 0.15s',
            }}
          >
            {game.icon} {game.name}
          </button>
        ))}
        <button
          onClick={() => setActiveTab('global')}
          style={{
            padding: '9px 22px', fontSize: 14, background: 'transparent', border: 'none',
            borderBottom: effectiveTab === 'global' ? '2px solid #94a3b8' : '2px solid transparent',
            color: effectiveTab === 'global' ? '#94a3b8' : '#64748b',
            fontWeight: effectiveTab === 'global' ? 700 : 500,
            cursor: 'pointer', marginBottom: -1, transition: 'all 0.15s',
          }}
        >
          🌐 Global
        </button>
      </div>

      {/* ─── Per-game tab content ─────────────────────────────────────── */}
      {configs.filter((g) => g.gameType === effectiveTab).map((game) => (
        <div key={game.gameType} style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28, alignItems: 'start' }}>
          {/* Left column: Scoring + Level Manager */}
          <div>
            {/* Scoring section */}
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>🎮 Scoring</h2>
              <p style={{ color: '#64748b', marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>
                Modifici regulile de scoring pentru meciurile <strong style={{ color: '#94a3b8' }}>viitoare</strong>.
                Override-ul de bază se aplică tuturor nivelelor; cel per-nivel are prioritate.
              </p>
            </div>
            <GameCard
              game={game}
              editing={editing}
              form={form}
              setForm={setForm}
              newLevelInput={newLevelInput}
              setNewLevelInput={setNewLevelInput}
              saving={saving}
              onOpenEdit={openEdit}
              onOpenNew={openNew}
              onCloseEdit={closeEdit}
              onSave={handleSave}
              onReset={handleReset}
            />

            {/* Level Manager section */}
            <div style={{ marginTop: 40, marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>🎯 Manager Nivele</h2>
              <p style={{ color: '#64748b', marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>
                Configurează nivele, dificultate și numărul maxim de jucători.
                Nivelele inactive sunt ascunse din UI și nu permit crearea de meciuri noi.
              </p>
            </div>
            <LevelManagerCard
              game={game}
              levels={levelConfigs[game.gameType] ?? []}
              onReload={load}
              showToast={showToast}
            />
          </div>

          {/* Right column: Bonus Challenges */}
          <div style={{ position: 'sticky', top: 24 }}>
            <BonusChallengesPanel
              gameType={game.gameType}
              gameName={game.name}
              primaryColor={game.primaryColor}
              challenges={bonusChallenges.filter((c) => c.gameType === game.gameType || c.gameType === '*')}
              challengeTypes={challengeTypes}
              onReload={load}
              showToast={showToast}
            />
          </div>
        </div>
      ))}

      {/* ─── Global tab content ───────────────────────────────────────────── */}
      {effectiveTab === 'global' && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>📈 ELO, XP & Ligi — Parametri Globali</h2>
            <p style={{ color: '#64748b', marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>
              Acești parametri afectează <strong style={{ color: '#ef4444' }}>toți jucătorii</strong> din meciurile viitoare.
              Modifică cu atenție.
            </p>
            <div style={{
              marginTop: 10, padding: '10px 16px', borderRadius: 8,
              background: '#7f1d1d22', border: '1px solid #ef444444',
              fontSize: 13, color: '#fca5a5',
            }}>
              ⚠️ ELO și ligile sunt <strong>permanente</strong> — odată ce jucătorii câștigă/pierd rating,
              nu se recalculează retroactiv la modificarea K-factor-ului.
            </div>
          </div>

          {sysLoadErr && (
            <div style={{ color: '#f87171', padding: 16 }}>Eroare la încărcarea parametrilor sistem.</div>
          )}

          {sysConfig && !sysLoadErr && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <UiSection sys={sysConfig} onSaved={(data) => setSysConfig(data)} showToast={showToast} />
              <EloSection sys={sysConfig} onSaved={(data) => setSysConfig(data)} showToast={showToast} />
              <XpSection sys={sysConfig} onSaved={(data) => setSysConfig(data)} showToast={showToast} />
              <LeagueSection sys={sysConfig} onSaved={(data) => setSysConfig(data)} showToast={showToast} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GameCard ──────────────────────────────────────────────────────────────────
function GameCard({
  game,
  editing,
  form,
  setForm,
  newLevelInput,
  setNewLevelInput,
  saving,
  onOpenEdit,
  onOpenNew,
  onCloseEdit,
  onSave,
  onReset,
}: {
  game: GameConfig;
  editing: string | null;
  form: EditForm;
  setForm: (f: EditForm) => void;
  newLevelInput: string;
  setNewLevelInput: (v: string) => void;
  saving: boolean;
  onOpenEdit: (gt: string, o: ScoringOverride) => void;
  onOpenNew: (g: GameConfig, level: number | null) => void;
  onCloseEdit: () => void;
  onSave: (gt: string, level: number | null) => void;
  onReset: (gt: string, level: number | null) => void;
}) {
  const baseOverride = game.overrides.find((o) => o.level === null) ?? null;
  const levelOverrides = game.overrides.filter((o) => o.level !== null);

  const editKeyBase = `${game.gameType}:base`;
  const isEditingBase = editing === editKeyBase;

  function getEditingLevel(): number | null {
    if (!editing) return null;
    const parts = editing.split(':');
    if (parts[0] !== game.gameType) return null;
    const lvl = parseInt(parts[1], 10);
    return isNaN(lvl) ? null : lvl;
  }

  const editingLevel = getEditingLevel();
  const isEditingLevel = editingLevel !== null;

  return (
    <div style={{
      background: '#1a1d27',
      border: `1px solid ${game.primaryColor}44`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 24px',
        borderBottom: `1px solid ${game.primaryColor}33`,
        background: `${game.primaryColor}11`,
      }}>
        <span style={{ fontSize: 28 }}>{game.icon}</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{game.name}</div>
          <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{game.gameType}</div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Default rules from code */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Default (din cod)
          </div>
          <RulesGrid rules={defaultsToForm(game.defaultRules)} highlight={game.primaryColor} readOnly />
        </div>

        {/* Base override */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
                Override de bază (toate nivelele)
              </span>
              {baseOverride && (
                <span style={{ fontSize: 11, background: '#7c3aed33', color: '#a78bfa', padding: '2px 8px', borderRadius: 4, border: '1px solid #7c3aed55' }}>
                  ACTIV
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {baseOverride && !isEditingBase && (
                <>
                  <SmallBtn color="#7c3aed" onClick={() => onOpenEdit(game.gameType, baseOverride)}>✏️ Editează</SmallBtn>
                  <SmallBtn color="#dc2626" onClick={() => onReset(game.gameType, null)}>🗑 Reset</SmallBtn>
                </>
              )}
              {!baseOverride && !isEditingBase && (
                <SmallBtn color={game.primaryColor} onClick={() => onOpenNew(game, null)}>+ Adaugă override</SmallBtn>
              )}
            </div>
          </div>

          {isEditingBase && (
            <EditPanel
              form={form}
              setForm={setForm}
              defaults={defaultsToForm(game.defaultRules)}
              primaryColor={game.primaryColor}
              saving={saving}
              level={null}
              onSave={() => onSave(game.gameType, null)}
              onCancel={onCloseEdit}
            />
          )}

          {baseOverride && !isEditingBase && (
            <RulesGrid rules={overrideToForm(baseOverride)} defaults={defaultsToForm(game.defaultRules)} highlight={game.primaryColor} />
          )}
        </div>

        {/* Per-level overrides */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
              Override-uri per nivel ({levelOverrides.length})
            </span>
            {!isEditingLevel && (
              <AddLevelRow
                game={game}
                newLevelInput={newLevelInput}
                setNewLevelInput={setNewLevelInput}
                onAdd={(lvl) => onOpenNew(game, lvl)}
              />
            )}
          </div>

          {levelOverrides.length === 0 && !isEditingLevel && (
            <div style={{ color: '#475569', fontSize: 13, padding: '8px 0' }}>
              Niciun override per nivel. Toate nivelele folosesc override-ul de bază sau default-ul din cod.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {levelOverrides.sort((a, b) => (a.level ?? 0) - (b.level ?? 0)).map((ov) => {
              const isEditingThis = editing === `${game.gameType}:${ov.level}`;
              return (
                <div key={ov.level} style={{ border: '1px solid #2d3748', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isEditingThis ? 12 : 8 }}>
                    <span style={{ color: game.primaryColor, fontSize: 13, fontWeight: 600 }}>Nivel {ov.level}</span>
                    {!isEditingThis && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <SmallBtn color={game.primaryColor} onClick={() => onOpenEdit(game.gameType, ov)}>✏️ Editează</SmallBtn>
                        <SmallBtn color="#dc2626" onClick={() => onReset(game.gameType, ov.level)}>🗑 Reset</SmallBtn>
                      </div>
                    )}
                  </div>
                  {isEditingThis && (
                    <EditPanel
                      form={form}
                      setForm={setForm}
                      defaults={defaultsToForm(game.defaultRules)}
                      primaryColor={game.primaryColor}
                      saving={saving}
                      level={ov.level}
                      onSave={() => onSave(game.gameType, ov.level)}
                      onCancel={onCloseEdit}
                    />
                  )}
                  {!isEditingThis && (
                    <RulesGrid rules={overrideToForm(ov)} defaults={defaultsToForm(game.defaultRules)} highlight={game.primaryColor} />
                  )}
                  {ov.updatedBy && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#475569' }}>
                      Modificat de <strong style={{ color: '#64748b' }}>{ov.updatedBy}</strong> la {new Date(ov.updatedAt).toLocaleString('ro-RO')}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Edit panel for NEW level */}
            {isEditingLevel && !levelOverrides.find((ov) => ov.level === editingLevel) && (
              <div style={{ border: `1px solid ${game.primaryColor}55`, borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ color: game.primaryColor, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  Nivel {editingLevel} — Override nou
                </div>
                <EditPanel
                  form={form}
                  setForm={setForm}
                  defaults={defaultsToForm(game.defaultRules)}
                  primaryColor={game.primaryColor}
                  saving={saving}
                  level={editingLevel}
                  onSave={() => onSave(game.gameType, editingLevel)}
                  onCancel={onCloseEdit}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AddLevelRow ──────────────────────────────────────────────────────────────
function AddLevelRow({ game, newLevelInput, setNewLevelInput, onAdd }: {
  game: GameConfig;
  newLevelInput: string;
  setNewLevelInput: (v: string) => void;
  onAdd: (level: number) => void;
}) {
  const existingLevels = new Set(game.overrides.filter((o) => o.level !== null).map((o) => o.level));
  const knownLevels = (game.availableLevels ?? []).filter((l) => !existingLevels.has(l));
  // Nivelele din dropdown care nu au override încă
  const hasKnown = knownLevels.length > 0;

  function handleAdd() {
    const lvl = parseInt(newLevelInput, 10);
    if (!Number.isFinite(lvl) || lvl < 1) return;
    onAdd(lvl);
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {hasKnown ? (
        // Dropdown cu nivelele cunoscute din DB
        <select
          value={newLevelInput}
          onChange={(e) => setNewLevelInput(e.target.value)}
          style={{
            padding: '4px 8px', borderRadius: 6,
            background: '#0f1117', border: `1px solid ${game.primaryColor}55`,
            color: newLevelInput ? '#e2e8f0' : '#475569', fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value="">Nivel...</option>
          {knownLevels.map((l) => (
            <option key={l} value={String(l)}>Nivel {l}</option>
          ))}
          <option value="__custom__" style={{ color: '#94a3b8' }}>Alt nivel…</option>
        </select>
      ) : (
        // Fallback: input manual când nu există meciuri jucate încă
        <input
          type="number"
          min={1}
          value={newLevelInput}
          onChange={(e) => setNewLevelInput(e.target.value)}
          placeholder="Nr. nivel..."
          style={{
            width: 100, padding: '4px 8px', borderRadius: 6,
            background: '#0f1117', border: `1px solid ${game.primaryColor}55`,
            color: '#e2e8f0', fontSize: 13,
          }}
        />
      )}
      {/* Input manual dacă s-a ales "Alt nivel…" */}
      {newLevelInput === '__custom__' && (
        <input
          type="number"
          min={1}
          autoFocus
          placeholder="Nr. nivel..."
          onChange={(e) => setNewLevelInput(e.target.value === '' ? '__custom__' : e.target.value)}
          style={{
            width: 100, padding: '4px 8px', borderRadius: 6,
            background: '#0f1117', border: `1px solid ${game.primaryColor}55`,
            color: '#e2e8f0', fontSize: 13,
          }}
        />
      )}
      <SmallBtn
        color={game.primaryColor}
        onClick={handleAdd}
      >+ Override nivel</SmallBtn>
    </div>
  );
}

// ─── EditPanel ────────────────────────────────────────────────────────────────
function EditPanel({ form, setForm, defaults, primaryColor, saving, level, onSave, onCancel }: {
  form: EditForm;
  setForm: (f: EditForm) => void;
  defaults: EditForm;
  primaryColor: string;
  saving: boolean;
  level: number | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {FIELDS.map(({ key, label, unit, hint }) => {
          if (key === 'timeLimitSeconds') {
            const isUnlimited = form.timeLimitSeconds === '0';
            return (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  {label} <span style={{ color: '#475569' }}>({unit})</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6, userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={!isUnlimited}
                    onChange={(e) => setForm({ ...form, timeLimitSeconds: e.target.checked ? '' : '0' })}
                    style={{ accentColor: primaryColor, width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: 12, color: isUnlimited ? '#34d399' : '#94a3b8' }}>
                    {isUnlimited ? '\u221e Fără limită de timp' : 'Activată'}
                  </span>
                </label>
                {!isUnlimited && (
                  <input
                    type="number"
                    value={form.timeLimitSeconds}
                    onChange={(e) => setForm({ ...form, timeLimitSeconds: e.target.value })}
                    placeholder={`default: ${defaults.timeLimitSeconds}`}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6,
                      background: '#0f1117', border: `1px solid ${form.timeLimitSeconds !== '' ? primaryColor + '88' : '#374151'}`,
                      color: '#e2e8f0', fontSize: 13,
                    }}
                  />
                )}
                {hint && !isUnlimited && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{hint}</div>}
              </div>
            );
          }
          return (
            <div key={key}>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                {label} <span style={{ color: '#475569' }}>({unit})</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={`default: ${defaults[key]}`}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6,
                    background: '#0f1117', border: `1px solid ${form[key] !== '' ? primaryColor + '88' : '#374151'}`,
                    color: '#e2e8f0', fontSize: 13,
                  }}
                />
              </div>
              {hint && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{hint}</div>}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: primaryColor, color: '#fff', fontWeight: 600, fontSize: 14,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '...' : `💾 Salvează${level !== null ? ` (Nivel ${level})` : ' (bază)'}`}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: '8px 16px', borderRadius: 7, border: '1px solid #374151', cursor: 'pointer',
            background: 'transparent', color: '#94a3b8', fontSize: 14,
          }}
        >
          Anulează
        </button>
      </div>
    </div>
  );
}

// ─── RulesGrid ────────────────────────────────────────────────────────────────
function RulesGrid({ rules, defaults, highlight, readOnly = false }: {
  rules: EditForm;
  defaults?: EditForm;
  highlight: string;
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {FIELDS.map(({ key, label, unit }) => {
        const val = rules[key];
        const isOverriding = defaults && val !== '' && val !== defaults[key];
        return (
          <div key={key} style={{
            padding: '8px 12px', borderRadius: 8,
            background: isOverriding ? `${highlight}18` : '#0f111799',
            border: `1px solid ${isOverriding ? highlight + '44' : '#2d374866'}`,
          }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: isOverriding ? highlight : (readOnly ? '#7c8fa6' : '#e2e8f0') }}>
              {val === '0'
                ? <span style={{ color: '#34d399', fontSize: 18 }}>∞</span>
                : val !== ''
                  ? <>{val}<span style={{ fontSize: 11, color: '#475569', fontWeight: 400, marginLeft: 4 }}>{unit}</span></>
                  : <span style={{ color: '#475569', fontStyle: 'italic', fontSize: 13 }}>default</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SmallBtn ─────────────────────────────────────────────────────────────────
function SmallBtn({ color, onClick, children }: {
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 6, border: `1px solid ${color}77`, cursor: 'pointer',
        background: `${color}18`, color: color, fontSize: 12, fontWeight: 600,
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ─── UiSection ────────────────────────────────────────────────────────────────
function UiSection({ sys, onSaved, showToast }: {
  sys: SystemConfigData;
  onSaved: (data: SystemConfigData) => void;
  showToast: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleToggle(nextEnabled: boolean) {
    setSaving(true);
    try {
      await adminApi.patch('/api/admin/system-config/ui', { aiAssistantEnabled: nextEnabled });
      const res = await adminApi.get('/api/admin/system-config');
      onSaved(res.data);
      showToast(`Asistent AI ${nextEnabled ? 'activat' : 'dezactivat'} ✓`, 'ok');
    } catch {
      showToast('Eroare la salvare', 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      await adminApi.delete('/api/admin/system-config/ui');
      const res = await adminApi.get('/api/admin/system-config');
      onSaved(res.data);
      showToast('Setările UI resetate la default ✓', 'ok');
    } catch {
      showToast('Eroare la reset', 'err');
    }
  }

  const enabled = sys.ui?.aiAssistantEnabled ?? true;
  const defaultEnabled = sys.defaults?.ui?.aiAssistantEnabled ?? true;
  const isDefault = enabled === defaultEnabled;

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #0ea5e944', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: '#0ea5e911', borderBottom: '1px solid #0ea5e933',
      }}>
        <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: 16 }}>Assistant UI</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <SmallBtn color="#dc2626" onClick={handleReset}>🔄 Reset default</SmallBtn>
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#94a3b8', fontSize: 13 }}>
          Controlează vizibilitatea widget-ului <strong style={{ color: '#e2e8f0' }}>Asistent AI</strong> din pagina de joc.
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#0f1117', border: '1px solid #1e2535', borderRadius: 8,
          padding: '12px 14px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.65 : 1,
        }}>
          <div>
            <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>Asistent AI în meci</div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
              {enabled ? 'Vizibil pentru jucători' : 'Ascuns pentru jucători'}
              {!isDefault && <span style={{ marginLeft: 8 }}>(default: {defaultEnabled ? 'ON' : 'OFF'})</span>}
            </div>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#0ea5e9' }}
          />
        </label>
      </div>
    </div>
  );
}

// ─── EloSection ───────────────────────────────────────────────────────────────
function EloSection({ sys, onSaved, showToast }: {
  sys: SystemConfigData;
  onSaved: (data: SystemConfigData) => void;
  showToast: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    kFactorLow: String(sys.elo.kFactorLow),
    kFactorMid: String(sys.elo.kFactorMid),
    kFactorHigh: String(sys.elo.kFactorHigh),
    thresholdMid: String(sys.elo.thresholdMid),
    thresholdHigh: String(sys.elo.thresholdHigh),
  });

  const isDefault = (key: keyof EloConfig) => sys.elo[key] === sys.defaults.elo[key];
  const kLim = sys.limits.elo.kFactor;
  const tLim = sys.limits.elo.threshold;

  async function handleSave() {
    setSaving(true);
    try {
      await adminApi.patch('/api/admin/system-config/elo', {
        kFactorLow: Number(form.kFactorLow),
        kFactorMid: Number(form.kFactorMid),
        kFactorHigh: Number(form.kFactorHigh),
        thresholdMid: Number(form.thresholdMid),
        thresholdHigh: Number(form.thresholdHigh),
      });
      const res = await adminApi.get('/api/admin/system-config');
      onSaved(res.data);
      setEditing(false);
      showToast('ELO salvat ✓', 'ok');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare la salvare';
      showToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('Resetezi toți parametrii ELO la valorile implicite?')) return;
    try {
      await adminApi.delete('/api/admin/system-config/elo');
      const res = await adminApi.get('/api/admin/system-config');
      onSaved(res.data);
      setEditing(false);
      showToast('ELO resetat la default ✓', 'ok');
    } catch {
      showToast('Eroare la reset', 'err');
    }
  }

  const rows: Array<{ key: keyof EloConfig; label: string; hint: string; min: number; max: number }> = [
    { key: 'kFactorLow',    label: 'K-factor mic (rating scăzut)',      hint: `${kLim.min}–${kLim.max}`, min: kLim.min, max: kLim.max },
    { key: 'kFactorMid',    label: 'K-factor mediu',                    hint: `${kLim.min}–${kLim.max}`, min: kLim.min, max: kLim.max },
    { key: 'kFactorHigh',   label: 'K-factor mare (rating ridicat)',     hint: `${kLim.min}–${kLim.max}`, min: kLim.min, max: kLim.max },
    { key: 'thresholdMid',  label: 'Prag low → mid (rating)',           hint: `${tLim.min}–${tLim.max}`, min: tLim.min, max: tLim.max },
    { key: 'thresholdHigh', label: 'Prag mid → high (rating)',          hint: `${tLim.min}–${tLim.max}`, min: tLim.min, max: tLim.max },
  ];

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #3b27a044', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: '#3b27a011', borderBottom: '1px solid #3b27a033',
      }}>
        <span style={{ fontWeight: 700, color: '#a78bfa', fontSize: 16 }}>📊 ELO K-factor</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && <SmallBtn color="#7c3aed" onClick={() => setEditing(true)}>✏️ Editează</SmallBtn>}
          <SmallBtn color="#dc2626" onClick={handleReset}>🔄 Reset default</SmallBtn>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {rows.map(({ key, label, hint }) => {
          const def = isDefault(key);
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0',
              borderBottom: '1px solid #1e2535',
            }}>
              <div style={{ flex: 1, fontSize: 13, color: '#94a3b8' }}>{label}</div>
              <div style={{ fontSize: 11, color: '#475569', minWidth: 60, textAlign: 'right' }}>{hint}</div>
              {editing ? (
                <input
                  type="number"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={{
                    width: 90, padding: '5px 8px', borderRadius: 6,
                    background: '#0f1117', border: '1px solid #7c3aed88',
                    color: '#e2e8f0', fontSize: 13, textAlign: 'right',
                  }}
                />
              ) : (
                <div style={{
                  minWidth: 90, textAlign: 'right', fontWeight: 700, fontSize: 15,
                  color: def ? '#94a3b8' : '#a78bfa',
                }}>
                  {sys.elo[key]}
                  {!def && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>(def: {sys.defaults.elo[key]})</span>}
                </div>
              )}
            </div>
          );
        })}
        {editing && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 14,
              opacity: saving ? 0.6 : 1,
            }}>{saving ? '...' : '💾 Salvează'}</button>
            <button onClick={() => setEditing(false)} disabled={saving} style={{
              padding: '8px 16px', borderRadius: 7, border: '1px solid #374151', cursor: 'pointer',
              background: 'transparent', color: '#94a3b8', fontSize: 14,
            }}>Anulează</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── XpSection ────────────────────────────────────────────────────────────────
function XpSection({ sys, onSaved, showToast }: {
  sys: SystemConfigData;
  onSaved: (data: SystemConfigData) => void;
  showToast: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    perWin:    String(sys.xp.perWin),
    perLoss:   String(sys.xp.perLoss),
    perDraw:   String(sys.xp.perDraw),
    bonusTop3: String(sys.xp.bonusTop3),
  });

  const isDefault = (key: keyof XpConfig) => sys.xp[key] === sys.defaults.xp[key];

  async function handleSave() {
    setSaving(true);
    try {
      await adminApi.patch('/api/admin/system-config/xp', {
        perWin: Number(form.perWin),
        perLoss: Number(form.perLoss),
        perDraw: Number(form.perDraw),
        bonusTop3: Number(form.bonusTop3),
      });
      const res = await adminApi.get('/api/admin/system-config');
      onSaved(res.data);
      setEditing(false);
      showToast('XP salvat ✓', 'ok');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare la salvare';
      showToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('Resetezi toți parametrii XP la valorile implicite?')) return;
    try {
      await adminApi.delete('/api/admin/system-config/xp');
      const res = await adminApi.get('/api/admin/system-config');
      onSaved(res.data);
      setEditing(false);
      showToast('XP resetat la default ✓', 'ok');
    } catch {
      showToast('Eroare la reset', 'err');
    }
  }

  const xpLim = sys.limits.xp;
  const rows: Array<{ key: keyof XpConfig; label: string; hint: string }> = [
    { key: 'perWin',    label: 'XP loc 1 (câștigător)',          hint: `${xpLim.perWin.min}–${xpLim.perWin.max}` },
    { key: 'perLoss',   label: 'XP ultimul loc / înfrangere',    hint: `${xpLim.perLoss.min}–${xpLim.perLoss.max}` },
    { key: 'perDraw',   label: 'XP prima jumătate (dacă >2)',    hint: `${xpLim.perDraw.min}–${xpLim.perDraw.max}` },
    { key: 'bonusTop3', label: 'Bonus top 3 (×2 pt loc 1)',      hint: `${xpLim.bonusTop3.min}–${xpLim.bonusTop3.max}` },
  ];

  // Preview effective XP
  const w = editing ? Number(form.perWin) || 0 : sys.xp.perWin;
  const b = editing ? Number(form.bonusTop3) || 0 : sys.xp.bonusTop3;
  const d = editing ? Number(form.perDraw) || 0 : sys.xp.perDraw;
  const l = editing ? Number(form.perLoss) || 0 : sys.xp.perLoss;

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #0e7a4444', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: '#0e7a4411', borderBottom: '1px solid #0e7a4433',
      }}>
        <span style={{ fontWeight: 700, color: '#34d399', fontSize: 16 }}>⭐ XP per Meci</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && <SmallBtn color="#10b981" onClick={() => setEditing(true)}>✏️ Editează</SmallBtn>}
          <SmallBtn color="#dc2626" onClick={handleReset}>🔄 Reset default</SmallBtn>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {rows.map(({ key, label, hint }) => {
          const def = isDefault(key);
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0',
              borderBottom: '1px solid #1e2535',
            }}>
              <div style={{ flex: 1, fontSize: 13, color: '#94a3b8' }}>{label}</div>
              <div style={{ fontSize: 11, color: '#475569', minWidth: 60, textAlign: 'right' }}>{hint}</div>
              {editing ? (
                <input
                  type="number"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={{
                    width: 90, padding: '5px 8px', borderRadius: 6,
                    background: '#0f1117', border: '1px solid #10b98188',
                    color: '#e2e8f0', fontSize: 13, textAlign: 'right',
                  }}
                />
              ) : (
                <div style={{
                  minWidth: 90, textAlign: 'right', fontWeight: 700, fontSize: 15,
                  color: def ? '#94a3b8' : '#34d399',
                }}>
                  {sys.xp[key]}
                  {!def && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>(def: {sys.defaults.xp[key]})</span>}
                </div>
              )}
            </div>
          );
        })}

        {/* Preview */}
        <div style={{
          marginTop: 14, padding: '10px 14px', background: '#0f1117',
          borderRadius: 8, border: '1px solid #1e2535', fontSize: 12, color: '#64748b',
          display: 'flex', gap: 20, flexWrap: 'wrap',
        }}>
          <span>Loc 1: <strong style={{ color: '#34d399' }}>+{w + b * 2} XP</strong></span>
          <span>Top 3: <strong style={{ color: '#34d399' }}>+{w + b} XP</strong></span>
          <span>Prima jum.: <strong style={{ color: '#94a3b8' }}>+{d} XP</strong></span>
          <span>Rest: <strong style={{ color: '#f87171' }}>+{l} XP</strong></span>
        </div>

        {editing && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: '#10b981', color: '#fff', fontWeight: 600, fontSize: 14,
              opacity: saving ? 0.6 : 1,
            }}>{saving ? '...' : '💾 Salvează'}</button>
            <button onClick={() => setEditing(false)} disabled={saving} style={{
              padding: '8px 16px', borderRadius: 7, border: '1px solid #374151', cursor: 'pointer',
              background: 'transparent', color: '#94a3b8', fontSize: 14,
            }}>Anulează</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LeagueSection ────────────────────────────────────────────────────────────
function LeagueSection({ sys, onSaved, showToast }: {
  sys: SystemConfigData;
  onSaved: (data: SystemConfigData) => void;
  showToast: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    silver:   String(sys.league.silver),
    gold:     String(sys.league.gold),
    platinum: String(sys.league.platinum),
    diamond:  String(sys.league.diamond),
  });

  const isDefault = (key: keyof LeagueConfig) => sys.league[key] === sys.defaults.league[key];
  const rLim = sys.limits.league.rating;

  async function handleSave() {
    setSaving(true);
    try {
      await adminApi.patch('/api/admin/system-config/league', {
        silver:   Number(form.silver),
        gold:     Number(form.gold),
        platinum: Number(form.platinum),
        diamond:  Number(form.diamond),
      });
      const res = await adminApi.get('/api/admin/system-config');
      onSaved(res.data);
      setEditing(false);
      showToast('Ligi salvate ✓', 'ok');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare la salvare';
      showToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm('Resetezi pragurile de ligă la valorile implicite?')) return;
    try {
      await adminApi.delete('/api/admin/system-config/league');
      const res = await adminApi.get('/api/admin/system-config');
      onSaved(res.data);
      setEditing(false);
      showToast('Ligi resetate la default ✓', 'ok');
    } catch {
      showToast('Eroare la reset', 'err');
    }
  }

  const LEAGUE_ICONS: Record<string, string> = {
    bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎', diamond: '💠',
  };

  const rows: Array<{ key: keyof LeagueConfig; label: string; prev: string }> = [
    { key: 'silver',   label: 'Silver — prag minim',   prev: 'Bronze: 0 – prag Silver' },
    { key: 'gold',     label: 'Gold — prag minim',     prev: 'Silver: prag Silver – prag Gold' },
    { key: 'platinum', label: 'Platinum — prag minim', prev: 'Gold: prag Gold – prag Platinum' },
    { key: 'diamond',  label: 'Diamond — prag minim',  prev: 'Platinum: prag Platinum – prag Diamond' },
  ];

  const cur = editing ? {
    silver:   Number(form.silver)   || sys.league.silver,
    gold:     Number(form.gold)     || sys.league.gold,
    platinum: Number(form.platinum) || sys.league.platinum,
    diamond:  Number(form.diamond)  || sys.league.diamond,
  } : sys.league;

  return (
    <div style={{ background: '#1a1d27', border: '1px solid #92400e44', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: '#92400e11', borderBottom: '1px solid #92400e33',
      }}>
        <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: 16 }}>🏆 Praguri Ligi</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && <SmallBtn color="#f59e0b" onClick={() => setEditing(true)}>✏️ Editează</SmallBtn>}
          <SmallBtn color="#dc2626" onClick={handleReset}>🔄 Reset default</SmallBtn>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {rows.map(({ key, label }) => {
          const def = isDefault(key);
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0',
              borderBottom: '1px solid #1e2535',
            }}>
              <div style={{ flex: 1, fontSize: 13, color: '#94a3b8' }}>{label}</div>
              <div style={{ fontSize: 11, color: '#475569', minWidth: 60, textAlign: 'right' }}>{rLim.min}–{rLim.max}</div>
              {editing ? (
                <input
                  type="number"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={{
                    width: 90, padding: '5px 8px', borderRadius: 6,
                    background: '#0f1117', border: '1px solid #f59e0b88',
                    color: '#e2e8f0', fontSize: 13, textAlign: 'right',
                  }}
                />
              ) : (
                <div style={{
                  minWidth: 90, textAlign: 'right', fontWeight: 700, fontSize: 15,
                  color: def ? '#94a3b8' : '#fbbf24',
                }}>
                  {sys.league[key]}
                  {!def && <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>(def: {sys.defaults.league[key]})</span>}
                </div>
              )}
            </div>
          );
        })}

        {/* Visual bands */}
        <div style={{
          marginTop: 14, padding: '10px 14px', background: '#0f1117',
          borderRadius: 8, border: '1px solid #1e2535', fontSize: 12,
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          {[
            { icon: LEAGUE_ICONS.bronze,   name: 'Bronze',   from: 0,           to: cur.silver - 1 },
            { icon: LEAGUE_ICONS.silver,   name: 'Silver',   from: cur.silver,   to: cur.gold - 1 },
            { icon: LEAGUE_ICONS.gold,     name: 'Gold',     from: cur.gold,     to: cur.platinum - 1 },
            { icon: LEAGUE_ICONS.platinum, name: 'Platinum', from: cur.platinum, to: cur.diamond - 1 },
            { icon: LEAGUE_ICONS.diamond,  name: 'Diamond',  from: cur.diamond,  to: null },
          ].map(({ icon, name, from, to }) => (
            <span key={name} style={{ color: '#94a3b8', background: '#1a1d27', padding: '3px 8px', borderRadius: 4, border: '1px solid #2d3748' }}>
              {icon} {name}: <strong style={{ color: '#e2e8f0' }}>{from}{to !== null ? `–${to}` : '+'}</strong>
            </span>
          ))}
        </div>

        {editing && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: '#f59e0b', color: '#111', fontWeight: 600, fontSize: 14,
              opacity: saving ? 0.6 : 1,
            }}>{saving ? '...' : '💾 Salvează'}</button>
            <button onClick={() => setEditing(false)} disabled={saving} style={{
              padding: '8px 16px', borderRadius: 7, border: '1px solid #374151', cursor: 'pointer',
              background: 'transparent', color: '#94a3b8', fontSize: 14,
            }}>Anulează</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BonusChallengesPanel ─────────────────────────────────────────────────────
function BonusChallengesPanel({
  gameType,
  gameName,
  primaryColor,
  challenges,
  challengeTypes,
  onReload,
  showToast,
}: {
  gameType: string;
  gameName: string;
  primaryColor: string;
  challenges: BonusChallenge[];
  challengeTypes: ChallengeTypeDef[];
  onReload: () => Promise<void>;
  showToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    gameType: gameType,
    challengeType: '',
    label: '',
    requiredValue: '',
    bonusPoints: '',
  });

  function resetForm() {
    setForm({ gameType, challengeType: '', label: '', requiredValue: '', bonusPoints: '' });
    setShowForm(false);
  }

  async function handleCreate() {
    if (!form.challengeType || !form.label || !form.requiredValue || !form.bonusPoints) {
      showToast('Completează toate câmpurile', 'err');
      return;
    }
    setSaving(true);
    try {
      await adminApi.post('/api/admin/bonus-challenges', {
        gameType: form.gameType,
        challengeType: form.challengeType,
        label: form.label,
        requiredValue: Number(form.requiredValue),
        bonusPoints: Number(form.bonusPoints),
      });
      showToast('Challenge creat ✓');
      resetForm();
      await onReload();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare';
      showToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(ch: BonusChallenge) {
    try {
      await adminApi.patch(`/api/admin/bonus-challenges/${ch.id}`, { isActive: !ch.isActive });
      showToast(ch.isActive ? 'Dezactivat' : 'Activat ✓');
      await onReload();
    } catch {
      showToast('Eroare la toggle', 'err');
    }
  }

  async function handleDelete(ch: BonusChallenge) {
    if (!confirm(`Ștergi challenge-ul "${ch.label}"? Nu se mai acordă bonus-uri noi, dar cele deja acordate rămân.`)) return;
    try {
      await adminApi.delete(`/api/admin/bonus-challenges/${ch.id}`);
      showToast('Șters ✓');
      await onReload();
    } catch {
      showToast('Eroare la ștergere', 'err');
    }
  }

  // Auto-populate label when type changes
  function handleTypeChange(type: string) {
    const def = challengeTypes.find((t) => t.type === type);
    const autoLabel = def ? def.label : '';
    setForm((f) => ({ ...f, challengeType: type, label: f.label || autoLabel }));
  }

  return (
    <div style={{ background: '#1a1d27', border: `1px solid ${primaryColor}44`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', background: `${primaryColor}11`, borderBottom: `1px solid ${primaryColor}33`,
      }}>
        <div>
          <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 15 }}>🎁 Bonus Challenges</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{gameName} — componente de recompensă</div>
        </div>
        {!showForm && (
          <SmallBtn color={primaryColor} onClick={() => setShowForm(true)}>+ Adaugă</SmallBtn>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${primaryColor}22`, background: `${primaryColor}08` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 12 }}>Componentă nouă</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Game scope */}
            <select
              value={form.gameType}
              onChange={(e) => setForm((f) => ({ ...f, gameType: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 6, background: '#0f1117', border: `1px solid ${primaryColor}55`, color: '#e2e8f0', fontSize: 13 }}
            >
              <option value={gameType}>{gameName}</option>
              <option value="*">🌐 Toate jocurile</option>
            </select>

            {/* Type */}
            <select
              value={form.challengeType}
              onChange={(e) => handleTypeChange(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, background: '#0f1117', border: `1px solid ${primaryColor}55`, color: form.challengeType ? '#e2e8f0' : '#475569', fontSize: 13 }}
            >
              <option value="">Tip de challenge...</option>
              {challengeTypes.map((t) => (
                <option key={t.type} value={t.type}>{t.icon} {t.label}</option>
              ))}
            </select>

            {/* Label */}
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Etichetă (ex: Veteran Integrame)"
              style={{ padding: '6px 10px', borderRadius: 6, background: '#0f1117', border: `1px solid ${primaryColor}55`, color: '#e2e8f0', fontSize: 13 }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Prag (nr. jocuri/pts/victorii)</label>
                <input
                  type="number"
                  min={1}
                  value={form.requiredValue}
                  onChange={(e) => setForm((f) => ({ ...f, requiredValue: e.target.value }))}
                  placeholder="ex: 20"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: '#0f1117', border: `1px solid ${primaryColor}55`, color: '#e2e8f0', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 3 }}>Bonus pts</label>
                <input
                  type="number"
                  min={1}
                  value={form.bonusPoints}
                  onChange={(e) => setForm((f) => ({ ...f, bonusPoints: e.target.value }))}
                  placeholder="ex: 200"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: '#0f1117', border: `1px solid ${primaryColor}55`, color: '#e2e8f0', fontSize: 13 }}
                />
              </div>
            </div>

            {/* Preview description */}
            {form.challengeType && form.requiredValue && form.bonusPoints && (() => {
              const typeDef = challengeTypes.find((t) => t.type === form.challengeType);
              return (
                <div style={{ fontSize: 12, color: '#94a3b8', background: '#0f1117', padding: '8px 10px', borderRadius: 6, border: '1px solid #2d3748', fontStyle: 'italic' }}>
                  {typeDef?.icon}{' '}
                  {typeDef ? `${typeDef.label}: ${form.requiredValue} → +${form.bonusPoints} pts` : `${form.challengeType}: ${form.requiredValue} → +${form.bonusPoints} pts`}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={handleCreate}
                disabled={saving}
                style={{ padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', background: primaryColor, color: '#fff', fontWeight: 600, fontSize: 13, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? '...' : '💾 Salvează'}
              </button>
              <button
                onClick={resetForm}
                disabled={saving}
                style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #374151', cursor: 'pointer', background: 'transparent', color: '#94a3b8', fontSize: 13 }}
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Challenge list */}
      <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {challenges.length === 0 && !showForm && (
          <div style={{ color: '#475569', fontSize: 13, padding: '8px 0', textAlign: 'center' }}>
            Nicio componentă de bonus. Apasă + Adaugă.
          </div>
        )}
        {challenges.map((ch) => (
          <div
            key={ch.id}
            style={{
              borderRadius: 8, padding: '10px 12px',
              background: ch.isActive ? `${primaryColor}0d` : '#0f1117',
              border: `1px solid ${ch.isActive ? primaryColor + '33' : '#2d374866'}`,
              opacity: ch.isActive ? 1 : 0.55,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15 }}>{ch.icon}</span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{ch.label}</span>
                  {ch.gameType === '*' && (
                    <span style={{ fontSize: 10, background: '#37415188', color: '#94a3b8', padding: '2px 6px', borderRadius: 4, border: '1px solid #47556988' }}>GLOBAL</span>
                  )}
                  {!ch.isActive && (
                    <span style={{ fontSize: 10, background: '#7f1d1d44', color: '#f87171', padding: '2px 6px', borderRadius: 4, border: '1px solid #ef444433' }}>INACTIV</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>{ch.description}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                  +<strong style={{ color: '#fbbf24' }}>{ch.bonusPoints} pts</strong> · acordat la <strong style={{ color: '#94a3b8' }}>{ch.awardsCount}</strong> jucători
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => handleToggle(ch)}
                  title={ch.isActive ? 'Dezactivează' : 'Activează'}
                  style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${ch.isActive ? '#ef444455' : '#10b98155'}`, cursor: 'pointer', background: 'transparent', color: ch.isActive ? '#f87171' : '#34d399', fontSize: 12 }}
                >
                  {ch.isActive ? '⏸' : '▶'}
                </button>
                <button
                  onClick={() => handleDelete(ch)}
                  title="Șterge"
                  style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #ef444455', cursor: 'pointer', background: 'transparent', color: '#f87171', fontSize: 12 }}
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LevelManagerCard ─────────────────────────────────────────────────────────
function LevelManagerCard({
  game,
  levels,
  onReload,
  showToast,
}: {
  game: GameConfig;
  levels: LevelConfig[];
  onReload: () => void;
  showToast: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [addingLevel, setAddingLevel] = useState(false);
  const [newLevelNum, setNewLevelNum] = useState('');
  const [addWinsToUnlock, setAddWinsToUnlock] = useState(5);
  const [addGamesPerLevel, setAddGamesPerLevel] = useState(3);
  const [addDisplayName, setAddDisplayName] = useState('');
  const [addMaxPlayers, setAddMaxPlayers] = useState(2);
  const [addDifficultyValue, setAddDifficultyValue] = useState(50);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: '',
    difficultyValue: 50,
    isActive: true,
    maxPlayers: 2,
    winsToUnlock: 5,
    gamesPerLevel: 3,
  });

  function openEdit(lc: LevelConfig) {
    setEditingLevel(lc.level);
    setEditForm({
      displayName: lc.displayName,
      difficultyValue: lc.difficultyValue,
      isActive: lc.isActive,
      maxPlayers: lc.maxPlayers,
      winsToUnlock: lc.winsToUnlock ?? 5,
      gamesPerLevel: lc.gamesPerLevel ?? 3,
    });
  }

  async function handleSave(level: number) {
    setSaving(true);
    try {
      await adminApi.patch(`/api/admin/level-configs/${game.gameType}/${level}`, editForm);
      showToast(`Nivel ${level} salvat ✓`, 'ok');
      setEditingLevel(null);
      await onReload();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare la salvare';
      showToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(level: number) {
    if (!confirm(`Ștergi nivelul ${level} din ${game.name}? Meciurile existente nu sunt afectate.`)) return;
    try {
      await adminApi.delete(`/api/admin/level-configs/${game.gameType}/${level}`);
      showToast(`Nivel ${level} șters ✓`, 'ok');
      await onReload();
    } catch {
      showToast('Eroare la ștergere', 'err');
    }
  }

  async function handleToggleActive(lc: LevelConfig) {
    try {
      await adminApi.patch(`/api/admin/level-configs/${game.gameType}/${lc.level}`, { isActive: !lc.isActive });
      showToast(`Nivel ${lc.level} ${!lc.isActive ? 'activat' : 'dezactivat'} ✓`, 'ok');
      await onReload();
    } catch {
      showToast('Eroare', 'err');
    }
  }

  async function handleAddLevel() {
    const lvl = parseInt(newLevelNum, 10);
    if (!Number.isFinite(lvl) || lvl < 1) return;
    if (levels.find((l) => l.level === lvl)) {
      showToast(`Nivelul ${lvl} există deja`, 'err');
      return;
    }
    setSaving(true);
    try {
      await adminApi.patch(`/api/admin/level-configs/${game.gameType}/${lvl}`, {
        displayName: addDisplayName.trim() || `Nivel ${lvl}`,
        difficultyValue: addDifficultyValue,
        isActive: true,
        maxPlayers: addMaxPlayers,
        winsToUnlock: addWinsToUnlock,
        gamesPerLevel: addGamesPerLevel,
      });
      showToast(`Nivel ${lvl} adăugat ✓`, 'ok');
      setAddingLevel(false);
      setNewLevelNum('');
      setAddDisplayName('');
      setAddMaxPlayers(2);
      setAddDifficultyValue(50);
      setAddWinsToUnlock(5);
      setAddGamesPerLevel(3);
      await onReload();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Eroare';
      showToast(msg, 'err');
    } finally {
      setSaving(false);
    }
  }

  const diffLabel = (v: number) => v < 30 ? 'Ușor' : v < 60 ? 'Mediu' : v < 80 ? 'Greu' : 'Extrem';
  const diffColor = (v: number) => `hsl(${120 - v * 1.2}, 70%, 50%)`;

  return (
    <div style={{
      background: '#1a1d27',
      border: `1px solid ${game.primaryColor}44`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px',
        borderBottom: `1px solid ${game.primaryColor}33`,
        background: `${game.primaryColor}11`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>{game.icon}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{game.name}</div>
            <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
              {levels.filter((l) => l.isActive).length} active / {levels.length} total
            </div>
          </div>
        </div>
        <SmallBtn color={game.primaryColor} onClick={() => { setAddingLevel(true); setNewLevelNum(''); setAddDisplayName(''); setAddMaxPlayers(2); setAddDifficultyValue(50); setAddWinsToUnlock(5); setAddGamesPerLevel(3); }}>
          + Adaugă nivel
        </SmallBtn>
      </div>

      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Add level form */}
        {addingLevel && (
          <div style={{
            padding: '14px 16px', borderRadius: 8,
            background: `${game.primaryColor}0a`,
            border: `1px dashed ${game.primaryColor}66`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 12 }}>Nivel nou</div>
            {/* Rând 1: număr nivel + denumire */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Număr nivel *</label>
                <input
                  type="number" min={1} autoFocus
                  value={newLevelNum}
                  onChange={(e) => {
                    setNewLevelNum(e.target.value);
                    if (!addDisplayName) setAddDisplayName(`Nivel ${e.target.value}`);
                  }}
                  placeholder="ex: 6"
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                    background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                    color: '#e2e8f0', fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Denumire nivel</label>
                <input
                  type="text" maxLength={100}
                  value={addDisplayName}
                  onChange={(e) => setAddDisplayName(e.target.value)}
                  placeholder={`Nivel ${newLevelNum || '?'}`}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                    background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                    color: '#e2e8f0', fontSize: 13,
                  }}
                />
              </div>
            </div>
            {/* Rând 2: max jucători, victorii, jocuri */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Max jucători (1–500)</label>
                <input
                  type="number" min={1} max={500}
                  value={addMaxPlayers}
                  onChange={(e) => setAddMaxPlayers(Math.max(1, Number(e.target.value)))}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                    background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                    color: '#e2e8f0', fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Victorii pentru deblocare (la nivelul anterior)</label>
                <input
                  type="number" min={1} max={500}
                  value={addWinsToUnlock}
                  onChange={(e) => setAddWinsToUnlock(Math.max(1, Number(e.target.value)))}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                    background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                    color: '#e2e8f0', fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Jocuri/nivel Solo (1–50)</label>
                <input
                  type="number" min={1} max={50}
                  value={addGamesPerLevel}
                  onChange={(e) => setAddGamesPerLevel(Math.max(1, Number(e.target.value)))}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                    background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                    color: '#e2e8f0', fontSize: 13,
                  }}
                />
              </div>
            </div>
            {/* Rând 3: dificultate */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Dificultate:{' '}
                <strong style={{ color: diffColor(addDifficultyValue) }}>{addDifficultyValue}%</strong>
                <span style={{ marginLeft: 8, color: '#475569' }}>({diffLabel(addDifficultyValue)})</span>
              </label>
              <input
                type="range" min={0} max={100} step={1}
                value={addDifficultyValue}
                onChange={(e) => setAddDifficultyValue(Number(e.target.value))}
                style={{ width: '100%', accentColor: game.primaryColor }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 2 }}>
                <span>0 — Ușor</span><span>50 — Mediu</span><span>100 — Extrem</span>
              </div>
            </div>
            {/* Butoane */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleAddLevel}
                disabled={saving || !newLevelNum}
                style={{
                  padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: game.primaryColor, color: '#fff', fontWeight: 600, fontSize: 14,
                  opacity: (saving || !newLevelNum) ? 0.5 : 1,
                }}
              >{saving ? '...' : '✚ Adaugă nivel'}</button>
              <button
                onClick={() => { setAddingLevel(false); setNewLevelNum(''); setAddDisplayName(''); setAddMaxPlayers(2); setAddDifficultyValue(50); setAddWinsToUnlock(5); setAddGamesPerLevel(3); }}
                style={{
                  padding: '8px 16px', borderRadius: 7, border: '1px solid #374151', cursor: 'pointer',
                  background: 'transparent', color: '#94a3b8', fontSize: 14,
                }}
              >Anulează</button>
            </div>
          </div>
        )}

        {levels.length === 0 && !addingLevel && (
          <div style={{ color: '#475569', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
            Nu există nivele configurate. Apasă &quot;+ Adaugă nivel&quot; pentru a începe.
          </div>
        )}

        {/* Level rows */}
        {levels.map((lc) => {
          const isEditing = editingLevel === lc.level;
          return (
            <div key={lc.level} style={{
              borderRadius: 8,
              border: `1px solid ${isEditing ? game.primaryColor + '66' : '#2d3748'}`,
              overflow: 'hidden',
              opacity: lc.isActive ? 1 : 0.65,
            }}>
              {/* Row header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                background: isEditing ? `${game.primaryColor}0d` : 'transparent',
              }}>
                <div style={{
                  minWidth: 36, height: 36, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: lc.isActive ? `${game.primaryColor}22` : '#2d374855',
                  border: `1px solid ${lc.isActive ? game.primaryColor + '44' : '#374151'}`,
                  fontSize: 14, fontWeight: 700,
                  color: lc.isActive ? game.primaryColor : '#475569',
                }}>
                  {lc.level}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: lc.isActive ? '#e2e8f0' : '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {lc.displayName || `Nivel ${lc.level}`}
                    {!lc.isActive && (
                      <span style={{ fontSize: 10, color: '#ef4444', background: '#ef444422', padding: '1px 6px', borderRadius: 4, border: '1px solid #ef444433' }}>INACTIV</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', display: 'flex', gap: 14, marginTop: 2 }}>
                    <span>🎯 <strong style={{ color: '#94a3b8' }}>{lc.difficultyValue}%</strong> — {diffLabel(lc.difficultyValue)}</span>
                    <span>👥 Max <strong style={{ color: '#94a3b8' }}>{lc.maxPlayers}</strong> jucători</span>
                    <span>🏆 <strong style={{ color: '#94a3b8' }}>{lc.winsToUnlock ?? 5}</strong> victorii pentru deblocare</span>
                    <span>🎮 <strong style={{ color: '#94a3b8' }}>{lc.gamesPerLevel ?? 3}</strong> jocuri/nivel Solo</span>
                    <span>🎮 <strong style={{ color: lc.matchCount > 0 ? '#60a5fa' : '#475569' }}>{lc.matchCount}</strong> meciuri jucate</span>
                  </div>
                </div>
                {!isEditing && (
                  <div style={{ width: 72 }}>
                    <div style={{ height: 5, background: '#1e2535', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${lc.difficultyValue}%`,
                        background: diffColor(lc.difficultyValue),
                      }} />
                    </div>
                  </div>
                )}
                {!isEditing && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <SmallBtn color={game.primaryColor} onClick={() => openEdit(lc)}>✏️</SmallBtn>
                    <SmallBtn color={lc.isActive ? '#6b7280' : '#10b981'} onClick={() => handleToggleActive(lc)}>
                      {lc.isActive ? '⏸' : '▶'}
                    </SmallBtn>
                    <SmallBtn color="#dc2626" onClick={() => handleDelete(lc.level)}>🗑</SmallBtn>
                  </div>
                )}
              </div>

              {/* Edit form */}
              {isEditing && (
                <div style={{ padding: '14px 14px', borderTop: `1px solid ${game.primaryColor}33`, background: '#0f1117' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Denumire nivel</label>
                      <input
                        type="text" maxLength={100}
                        value={editForm.displayName}
                        onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                        style={{
                          width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                          background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                          color: '#e2e8f0', fontSize: 13,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Max jucători per meci (1–500)</label>
                      <input
                        type="number" min={1} max={500}
                        value={editForm.maxPlayers}
                        onChange={(e) => setEditForm({ ...editForm, maxPlayers: Number(e.target.value) })}
                        style={{
                          width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                          background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                          color: '#e2e8f0', fontSize: 13,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Victorii pentru deblocare (la niv. anterior)</label>
                      <input
                        type="number" min={1} max={500}
                        value={editForm.winsToUnlock}
                        onChange={(e) => setEditForm({ ...editForm, winsToUnlock: Number(e.target.value) })}
                        style={{
                          width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                          background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                          color: '#e2e8f0', fontSize: 13,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Jocuri per nivel Solo (1–50)</label>
                      <input
                        type="number" min={1} max={50}
                        value={editForm.gamesPerLevel}
                        onChange={(e) => setEditForm({ ...editForm, gamesPerLevel: Number(e.target.value) })}
                        style={{
                          width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
                          background: '#1a1d27', border: `1px solid ${game.primaryColor}55`,
                          color: '#e2e8f0', fontSize: 13,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                      Dificultate:{' '}
                      <strong style={{ color: diffColor(editForm.difficultyValue) }}>{editForm.difficultyValue}%</strong>
                      <span style={{ marginLeft: 8, color: '#475569' }}>({diffLabel(editForm.difficultyValue)})</span>
                    </label>
                    <input
                      type="range" min={0} max={100} step={1}
                      value={editForm.difficultyValue}
                      onChange={(e) => setEditForm({ ...editForm, difficultyValue: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: game.primaryColor }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 2 }}>
                      <span>0 — Ușor</span><span>50 — Mediu</span><span>100 — Extrem</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <label style={{ fontSize: 12, color: '#94a3b8' }}>Status:</label>
                    <button
                      onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                      style={{
                        padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: editForm.isActive ? '#10b981' : '#374151',
                        color: '#fff', fontWeight: 600, fontSize: 12,
                      }}
                    >
                      {editForm.isActive ? '✓ Activ' : '✗ Inactiv'}
                    </button>
                    <span style={{ fontSize: 11, color: '#475569' }}>
                      {editForm.isActive ? 'Apare în UI, se pot crea meciuri' : 'Ascuns din UI, nu se pot crea meciuri noi'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => handleSave(lc.level)}
                      disabled={saving}
                      style={{
                        padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        background: game.primaryColor, color: '#fff', fontWeight: 600, fontSize: 14,
                        opacity: saving ? 0.6 : 1,
                      }}
                    >{saving ? '...' : `💾 Salvează Nivel ${lc.level}`}</button>
                    <button
                      onClick={() => setEditingLevel(null)}
                      disabled={saving}
                      style={{
                        padding: '8px 16px', borderRadius: 7, border: '1px solid #374151', cursor: 'pointer',
                        background: 'transparent', color: '#94a3b8', fontSize: 14,
                      }}
                    >Anulează</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
