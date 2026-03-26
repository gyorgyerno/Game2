# Admin — Configurare Scoring per Joc / Nivel

**Implementat:** 2026-03-26

---

## Ce face

Pagina `http://localhost:3000/admin/settings` permite editarea regulilor de scoring (puncte, timp, bonusuri) pentru fiecare joc și, opțional, per nivel — fără a modifica codul.

Modificările se aplică **doar meciurilor viitoare**. Meciurile deja jucate nu sunt afectate (scorurile sunt salvate la finalizarea meciului).

---

## Regulile editabile

| Câmp | Sensul |
|---|---|
| `pointsPerCorrect` | Puncte pentru fiecare răspuns corect |
| `pointsPerMistake` | Puncte per greșeală (negativ = penalizare) |
| `bonusFirstFinisher` | Bonus acordat primului jucător care termină |
| `bonusCompletion` | Bonus acordat la completarea jocului |
| `timeLimitSeconds` | Timp maxim al meciului în secunde |
| `forfeitBonus` | Bonus acordat când adversarul abandonează |

---

## Cum funcționează (prioritate)

```
Default din cod (IntegrameGame.ts / MazeGame.ts)
    ↓  (suprascris de)
Override de bază per joc  (level = null)
    ↓  (suprascris de)
Override per nivel specific  (level = N)
```

Dacă un câmp nu are override, se folosește valoarea din cod.

---

## Fișiere modificate

### Backend

| Fișier | Ce s-a schimbat |
|---|---|
| `prisma/schema.prisma` | Model nou `GameScoringConfig` adăugat |
| `prisma/migrations/20260326154934_add_game_scoring_config/` | Migrare SQLite generată și aplicată |
| `src/games/GameRegistry.ts` | Metodele `getEffectiveRules`, `loadScoringOverrides`, `setScoringOverride`, `calculateLiveScoreForLevel`, `calculateFinalScoreForLevel` |
| `src/routes/admin.ts` | 3 endpoint-uri noi: `GET /scoring-configs`, `PATCH /scoring-configs/:gameType`, `DELETE /scoring-configs/:gameType` |
| `src/socket/matchHandler.ts` | `calculateLiveScore` → `calculateLiveScoreForLevel`, `calculateFinalScore` → `calculateFinalScoreForLevel`, `getRules` → `getEffectiveRules` (timeLimit + forfeit) |
| `src/index.ts` | `gameRegistry.loadScoringOverrides(prisma)` apelat la startup |

### Frontend

| Fișier | Ce s-a schimbat |
|---|---|
| `src/app/admin/settings/page.tsx` | Pagină nouă — afișează și editează scoring configs per joc/nivel |

---

## API endpoints

### `GET /api/admin/scoring-configs`
Returnează toate jocurile înregistrate cu regulile default + override-urile active din DB.

```json
{
  "configs": [
    {
      "gameType": "integrame",
      "name": "Integrame",
      "icon": "🧩",
      "primaryColor": "#7c3aed",
      "defaultRules": { "pointsPerCorrect": 10, "pointsPerMistake": -5, ... },
      "overrides": [
        { "id": "...", "level": null, "pointsPerCorrect": 15, ... },
        { "id": "...", "level": 3, "timeLimitSeconds": 120, ... }
      ]
    }
  ]
}
```

### `PATCH /api/admin/scoring-configs/:gameType`
Body: `{ level?: number | null, pointsPerCorrect?: number, ... }`
- `level: null` sau omis → override de bază (se aplică tuturor nivelelor)
- `level: 3` → override specific pentru nivelul 3

### `DELETE /api/admin/scoring-configs/:gameType?level=N`
- Fără `?level` → șterge override-ul de bază
- Cu `?level=3` → șterge override-ul pentru nivelul 3

---

## Adăugare joc nou — automat

Pagina de settings este **dinamică**: citește `gameRegistry.listAll()`. Când adaugi un joc nou urmând pașii din `GameRegistry.ts` (register, implement IGame), apare automat în pagina de settings fără nicio modificare suplimentară.

---

## ELO, XP & Ligi — Parametri Globali

**Implementat:** 2026-03-26

Aceeași pagină `http://localhost:3000/admin/settings` permite și editarea parametrilor globali de ELO, XP și ligi — vizibili în secțiunea de jos cu avertisment.

> ⚠️ Modificările afectează **toți jucătorii** din meciurile viitoare. ELO deja câștigat/pierdut **nu se recalculează retroactiv**.

---

### Parametrii editabili

#### ELO K-factor

| Câmp | Default | Limit | Sensul |
|---|---|---|---|
| `kFactorLow` | 32 | 4–128 | K-factor pentru jucători cu rating scăzut (sub `thresholdMid`) |
| `kFactorMid` | 24 | 4–128 | K-factor mediu (`thresholdMid` – `thresholdHigh`) |
| `kFactorHigh` | 16 | 4–128 | K-factor pentru jucători cu rating ridicat (peste `thresholdHigh`) |
| `thresholdMid` | 1200 | 100–9000 | Pragul de trecere low → mid |
| `thresholdHigh` | 1600 | 100–9000 | Pragul de trecere mid → high |

#### XP per Meci

| Câmp | Default | Limit | Sensul |
|---|---|---|---|
| `perWin` | 50 | 0–10000 | XP acordat locului 1 |
| `perLoss` | 10 | 0–10000 | XP acordat ultimului loc / înfrângere |
| `perDraw` | 25 | 0–10000 | XP prima jumătate a clasamentului (când >2 jucători) |
| `bonusTop3` | 20 | 0–10000 | Bonus adăugat pentru top 3 (×2 pt loc 1, ×1 pt locurile 2–3) |

XP efectiv: loc 1 = `perWin + bonusTop3 × 2`, loc 2–3 = `perWin + bonusTop3`, prima jumătate = `perDraw`, rest = `perLoss`.

#### Praguri Ligi

| Câmp | Default | Limit | Sensul |
|---|---|---|---|
| `silver` | 1200 | 100–9000 | Rating minim pentru liga Silver |
| `gold` | 1400 | 100–9000 | Rating minim pentru liga Gold |
| `platinum` | 1600 | 100–9000 | Rating minim pentru liga Platinum |
| `diamond` | 1800 | 100–9000 | Rating minim pentru liga Diamond |

Ordinea trebuie respectată: `silver < gold < platinum < diamond`.

---

### Fișiere modificate (ELO/XP/Ligi)

#### Backend

| Fișier | Ce s-a schimbat |
|---|---|
| `prisma/schema.prisma` | Model nou `SystemConfig` (key-value store) |
| `prisma/migrations/20260326160713_add_system_config/` | Migrare SQLite generată și aplicată |
| `src/services/SystemConfigService.ts` | Singleton nou — încarcă/salvează config ELO/XP/Ligi din DB, expune `calculateELO`, `calculateXPGained`, `ratingToLeague` |
| `src/routes/admin.ts` | 5 endpoint-uri noi: `GET /system-config`, `PATCH /system-config/elo`, `PATCH /system-config/xp`, `PATCH /system-config/league`, `DELETE /system-config/:key` |
| `src/socket/matchHandler.ts` | Import-urile `calculateELO`, `calculateXPGained`, `ratingToLeague` din `@integrame/shared` înlocuite cu `systemConfigService.*` |
| `src/index.ts` | `systemConfigService.load(prisma)` apelat la startup după `loadScoringOverrides` |

#### Frontend

| Fișier | Ce s-a schimbat |
|---|---|
| `src/app/admin/settings/page.tsx` | Tipuri `EloConfig`, `XpConfig`, `LeagueConfig`, `SystemConfigData`; state `sysConfig`; `load()` extins cu `Promise.all`; secțiune nouă cu componentele `EloSection`, `XpSection`, `LeagueSection` |

---

### API endpoints (ELO/XP/Ligi)

#### `GET /api/admin/system-config`
Returnează valorile curente, default-urile și limitele pentru ELO, XP și ligi.

```json
{
  "elo": { "kFactorLow": 32, "kFactorMid": 24, "kFactorHigh": 16, "thresholdMid": 1200, "thresholdHigh": 1600 },
  "xp": { "perWin": 50, "perLoss": 10, "perDraw": 25, "bonusTop3": 20 },
  "league": { "silver": 1200, "gold": 1400, "platinum": 1600, "diamond": 1800 },
  "defaults": { "elo": { ... }, "xp": { ... }, "league": { ... } },
  "limits": { "elo": { "kFactor": { "min": 4, "max": 128 }, ... }, ... }
}
```

#### `PATCH /api/admin/system-config/elo`
Body: orice subset din câmpurile ELO. Validează că `thresholdMid < thresholdHigh` și că K-factor-ele sunt în limita 4–128.

#### `PATCH /api/admin/system-config/xp`
Body: orice subset din câmpurile XP. Validează că toate valorile sunt în 0–10000.

#### `PATCH /api/admin/system-config/league`
Body: orice subset din pragurile de ligă. Validează ordinea `silver < gold < platinum < diamond`.

#### `DELETE /api/admin/system-config/:key`
`key` poate fi `elo`, `xp` sau `league`. Resetează blocul respectiv la valorile default din cod.

---

## Note tehnice

- Backend-ul ține override-urile **în memorie** (`Map`) pentru performanță, sincronizate cu DB la startup și după fiecare save/delete din admin.
- SQLite tratează `NULL` ca distincte în unique indexes → am folosit `findFirst + create/update` în loc de `upsert` pentru `level = null`.
- Câmpurile `null` în DB înseamnă "nu există override, folosește default-ul din cod" — nu suprascriem cu 0.
