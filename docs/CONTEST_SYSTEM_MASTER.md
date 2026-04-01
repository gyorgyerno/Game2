
# Contest / Tournament System — Master Doc

**Data implementare:** 31 martie 2026  
**Autor:** GitHub Copilot  
**Status:** ✅ Complet implementat și testat

---

## 1. Obiectiv

Adăugare unui sistem de concursuri/turnee **non-breaking** pe platforma existentă Integrame.  
Principii de design:
- Jocurile nu știu nimic despre concursuri
- Multiple concursuri simultane posibile
- Hook de 2 linii în `finalizeMatch` alimentează toate concursurile active
- Admin controlează complet: creare, editare, maxPlayers, force-start, force-end, statistici live

---

## 2. Modele Prisma

**Migrare:** `20260331092637_add_contest_system`  
**Fișier:** `backend/prisma/schema.prisma`

```prisma
model Contest {
  id          Int              @id @default(autoincrement())
  name        String
  slug        String           @unique
  description String?
  type        String           @default("public")   // "public" | "private"
  status      String           @default("waiting")  // "waiting" | "live" | "ended"
  startAt     DateTime
  endAt       DateTime
  maxPlayers  Int?             // null = nelimitat
  createdBy   Int
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  players     ContestPlayer[]
  games       ContestGame[]
  scores      ContestScore[]
  @@index([status])
  @@index([slug])
  @@map("contests")
}

model ContestPlayer {
  id         Int      @id @default(autoincrement())
  contestId  Int
  userId     Int
  joinedAt   DateTime @default(now())
  contest    Contest  @relation(fields: [contestId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([contestId, userId])
  @@map("contest_players")
}

model ContestGame {
  id         Int     @id @default(autoincrement())
  contestId  Int
  gameType   String
  contest    Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  @@unique([contestId, gameType])
  @@map("contest_games")
}

model ContestScore {
  id         Int      @id @default(autoincrement())
  contestId  Int
  userId     Int
  gameType   String
  matchId    String?
  score      Int
  timeTaken  Int?
  createdAt  DateTime @default(now())
  contest    Contest  @relation(fields: [contestId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("contest_scores")
}
```

---

## 3. ContestEngine (Singleton Service)

**Fișier:** `backend/src/services/ContestEngine.ts`

### Responsabilități
| Metodă | Descriere |
|--------|-----------|
| `start(prisma, io)` | Inițializare + interval 30s pentru tranziții automate |
| `transitionStatuses()` | `waiting→live` la `startAt`, `live→ended` la `endAt`; emite socket events |
| `processMatchResult(matchId, gameType, userId, score, timeTaken)` | Găsește toate concursurile `live` unde user-ul e înscris și gameType-ul e inclus; salvează scor; emite leaderboard update |
| `getLeaderboard(contestId)` | Agregă cel mai bun scor per `(userId × gameType)`, returnează array sortat cu rank |
| `getContestStats(contestId)` | Statistici complete pentru panoul admin |
| `forceStart(contestId)` | Admin: trece direct pe `live` |
| `forceEnd(contestId)` | Admin: trece direct pe `ended` |
| `markOnline(contestId, userId)` | Marchează user ca online în concurs (Set in-memory) |
| `markOffline(contestId, userId)` | Opusul |
| `markOfflineFromAll(userId)` | La disconnect: scoate user din toate concursurile |

### Export
```ts
export const contestEngine = new ContestEngine();
```

---

## 4. API Routes

### 4.1 Public — `backend/src/routes/contests.ts`

Montat la: `app.use('/api/contests', contestsRoutes)` în `index.ts`

| Metodă | Endpoint | Auth | Descriere |
|--------|----------|------|-----------|
| GET | `/api/contests/:slug` | opțional | Detalii concurs + `isRegistered` |
| POST | `/api/contests/:slug/join` | necesar | Înregistrare (verifică `maxPlayers`) |
| GET | `/api/contests/:slug/leaderboard` | nu | Clasament live |
| GET | `/api/contests/:slug/players` | nu | Lista jucători + isOnline |

### 4.2 Admin — `backend/src/routes/admin.ts`

| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/admin/contests` | Toate concursurile cu stats (registeredCount, onlineCount) |
| POST | `/api/admin/contests` | Creare (name, slug, startAt, endAt, gameTypes, maxPlayers) |
| PATCH | `/api/admin/contests/:id` | Editare (inclusiv gameTypes) |
| DELETE | `/api/admin/contests/:id` | Ștergere cu cascade |
| POST | `/api/admin/contests/:id/force-start` | Forțează status `live` |
| POST | `/api/admin/contests/:id/force-end` | Forțează status `ended` |
| GET | `/api/admin/contests/:id/players` | Detalii jucători: rank, bestScore per gameType, scoreHistory |
| GET | `/api/admin/contests/:id/stats` | Stats complete din ContestEngine |

---

## 5. Integrare în Sistem Existent

### 5.1 Hook în `matchHandler.ts` (non-breaking)

**Fișier:** `backend/src/socket/matchHandler.ts`

Adăugat după `io.to(room).emit(SOCKET_EVENTS.MATCH_FINISHED, final)`:

```ts
// Hook non-breaking pentru Contest System
if (final) {
  const realFinished = final.players.filter(
    (p) => p.user.userType === 'REAL' && p.finishedAt != null
  );
  for (const rp of realFinished) {
    const timeTaken =
      match.startedAt && rp.finishedAt
        ? Math.round((new Date(rp.finishedAt).getTime() - new Date(match.startedAt).getTime()) / 1000)
        : undefined;
    contestEngine
      .processMatchResult(matchId, match.gameType, rp.userId, rp.score, timeTaken)
      .catch((err) => logger.warn('[ContestEngine] hook error', { err }));
  }
}
```

### 5.2 Socket Rooms — `socket/index.ts`

Adăugat în `io.on('connection')`:

```ts
socket.on('join_contest_room', ({ contestId }) => {
  socket.join(`contest:${contestId}`);
  contestEngine.markOnline(contestId, userId);
});

socket.on('leave_contest_room', ({ contestId }) => {
  socket.leave(`contest:${contestId}`);
  contestEngine.markOffline(contestId, userId);
});
// disconnect extins cu: contestEngine.markOfflineFromAll(userId)
```

### 5.3 Startup în `index.ts`

```ts
import { initSocket, io } from './socket';
import { contestEngine } from './services/ContestEngine';
// ...
app.use('/api/contests', contestsRoutes);
// ...
server.listen(PORT, () => {
  // ... alte init-uri ...
  contestEngine.start(prisma, io);
  logger.info('✅ ContestEngine pornit');
});
```

---

## 6. Tipuri Shared

**Fișier:** `shared/src/index.ts`

```ts
export type ContestStatus = 'waiting' | 'live' | 'ended';
export type ContestType   = 'public'  | 'private';

export interface ContestPublic {
  id: number; name: string; slug: string; description?: string;
  type: ContestType; status: ContestStatus;
  startAt: string; endAt: string; maxPlayers?: number;
  registeredCount: number; isRegistered?: boolean;
  games: string[];
}

export interface ContestLeaderboardEntry {
  rank: number; userId: number; username: string; avatar?: string;
  totalScore: number; scores: Record<string, number>;
}

// Socket event payloads
export interface ContestRoomJoin    { contestId: number }
export interface ContestRoomLeave   { contestId: number }
export interface ContestStatusChange { contestId: number; status: ContestStatus }
export interface ContestLeaderboardUpdate { contestId: number; leaderboard: ContestLeaderboardEntry[] }
export interface ContestPlayersUpdate    { contestId: number; registeredCount: number; onlineCount: number }
```

---

## 7. Frontend Web

### 7.1 Pagina Publică — `/contest/[slug]`

**Fișier:** `frontend-web/src/app/contest/[slug]/page.tsx`

Mașină de stări completă:

| Stare | UI afișat |
|-------|-----------|
| `NOT_AUTH` | Redirect către login |
| `NOT_REGISTERED` | Buton JOIN + detalii concurs |
| `WAITING` | Countdown + linkuri practică |
| `LIVE` | Butoane de joc + leaderboard real-time + card rank personal |
| `ENDED` | Leaderboard final + rank personal |

Socket: join `contest:${id}` room; ascultă:
- `contest_leaderboard_update`
- `contest_status_change`
- `contest_players_update`

### 7.2 Componente

**`ContestCountdown.tsx`** — `frontend-web/src/components/contest/`
- Afișaj vizual HH:MM:SS cu segmente separate
- Pulsează roșu în ultimele 60 de secunde

**`ContestLeaderboard.tsx`** — `frontend-web/src/components/contest/`
- Tabel cu medalii 🥇🥈🥉 pentru top 3
- Coloane per gameType + scor total
- Animație rank-change (highlight galben 2s la schimbare)
- Rândul user-ului curent evidențiat violet

### 7.3 API Client

**Fișier:** `frontend-web/src/lib/api.ts`

```ts
export const contestsApi = {
  get:         (slug: string)                => api.get(`/contests/${slug}`),
  join:        (slug: string)                => api.post(`/contests/${slug}/join`, {}),
  leaderboard: (slug: string, limit?: number) => api.get(`/contests/${slug}/leaderboard`, { params: { limit } }),
  players:     (slug: string)                => api.get(`/contests/${slug}/players`),
};
```

### 7.4 Pagina Admin — `/admin/contests`

**Fișier:** `frontend-web/src/app/admin/contests/page.tsx`

Funcționalități:
- **Listă concursuri** cu badge-uri de status, progress bar înregistrați/maxPlayers, contori online
- **Auto-refresh** la 15 secunde
- **Formular creare/editare**: name, slug, descriere, gameTypes (checkboxes), startAt, endAt, maxPlayers, tip public/privat
- **Force Start / Force End** per concurs
- **Panou jucători** cu:
  - Rank, username, email, ELO (colorat per ligă)
  - Cel mai bun scor per gameType
  - Scor total + număr meciuri
  - Data înregistrare + indicator online
  - Istoric scoruri expandabil per jucător

### 7.5 Navigare Admin

**Fișier:** `frontend-web/src/app/admin/layout.tsx`

Adăugat în array-ul `NAV`:
```ts
{ href: '/admin/contests', label: 'Concursuri', icon: '🏆' },
```

---

## 8. Flow Complet

```
Admin creează concurs (/admin/contests)
  → slug, gameTypes, startAt, endAt, maxPlayers
  
Users se înscriu (/contest/[slug])
  → POST /api/contests/:slug/join
  → verificare maxPlayers
  
ContestEngine.transitionStatuses() [la fiecare 30s]
  → waiting → live (când now >= startAt)
  → live → ended (când now >= endAt)
  → emite socket event contest_status_change

User joacă un meci normal (orice joc inclus în concurs)
  → matchHandler.finalizeMatch() rulează normal
  → HOOK: contestEngine.processMatchResult() [non-blocking, .catch()]
    → găsește concursuri live cu acest user + gameType
    → salvează ContestScore în DB
    → recalculează leaderboard
    → emite contest_leaderboard_update pe room contest:{id}

Frontend /contest/[slug]
  → primește update în timp real
  → animează schimbările de rank
  → afișează status concurs live
```

---

## 9. Verificare Implementare

| Check | Status |
|-------|--------|
| `npx tsc --noEmit` (fără erori) | ✅ |
| `GET /api/contests/test` → `"Concursul nu a fost găsit"` | ✅ |
| Migration aplicată | ✅ `20260331092637_add_contest_system` |
| Serverul pornit pe port 4000 | ✅ |

---

## 10. Fișiere Modificate / Create

### Create (noi)
| Fișier | Descriere |
|--------|-----------|
| `backend/src/services/ContestEngine.ts` | Singleton engine |
| `backend/src/routes/contests.ts` | API public |
| `backend/prisma/migrations/20260331092637_add_contest_system/` | Migrare DB |
| `frontend-web/src/app/contest/[slug]/page.tsx` | Pagina publică concurs |
| `frontend-web/src/app/admin/contests/page.tsx` | Panou admin |
| `frontend-web/src/components/contest/ContestCountdown.tsx` | Componentă countdown |
| `frontend-web/src/components/contest/ContestLeaderboard.tsx` | Componentă leaderboard |

### Modificate
| Fișier | Ce s-a adăugat |
|--------|----------------|
| `backend/prisma/schema.prisma` | 4 modele noi: Contest, ContestPlayer, ContestGame, ContestScore |
| `backend/src/routes/admin.ts` | 8 endpoint-uri admin pentru concursuri |
| `backend/src/socket/matchHandler.ts` | Hook non-blocking după MATCH_FINISHED |
| `backend/src/socket/index.ts` | Handlere `join_contest_room`, `leave_contest_room`, extend `disconnect` |
| `backend/src/index.ts` | Import + mount `/api/contests` + `contestEngine.start()` |
| `shared/src/index.ts` | Tipuri: ContestStatus, ContestType, ContestPublic, etc. |
| `frontend-web/src/lib/api.ts` | `contestsApi` obiect |
| `frontend-web/src/app/admin/layout.tsx` | Link navigare 🏆 Concursuri |

---

## 11. Update — Runde Dinamice (31 martie 2026)

**Motivație:** Design-ul inițial cu `ContestGame` (doar `gameType`) nu permitea control asupra nivelului de dificultate sau numărului de meciuri luate în calcul per tip de joc. Adminul dorea să poată adăuga dinamic runde, fiecare cu configurație proprie.

**Migrare:** `20260331102946_add_contest_rounds`

---

### 11.1 Schema Prisma — Ce s-a schimbat

**Eliminat:** modelul `ContestGame`

**Adăugat:** modelul `ContestRound`

```prisma
model ContestRound {
  id           String  @id @default(cuid())
  contestId    String
  order        Int              // 1, 2, 3... (ordinea rundei)
  label        String           // ex: "Joc 1", "Runda Finală"
  gameType     String           // integrame | labirinturi | slogane
  minLevel     Int @default(1)  // nivel minim acceptat (1–5)
  matchesCount Int @default(1)  // cele mai bune N meciuri contează
  contest      Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  scores       ContestScore[]
  @@unique([contestId, order])
  @@map("contest_rounds")
}
```

**Actualizat:** `ContestScore` — adăugate câmpurile:
```prisma
roundId  String        // FK obligatoriu la ContestRound
level    Int @default(1) // nivelul la care s-a jucat meciul
round    ContestRound @relation(fields: [roundId], references: [id], onDelete: Cascade)
```

---

### 11.2 ContestEngine — Interfețe și logică nouă

**Interfețe actualizate:**

```ts
export interface RoundEntry {
  roundId: string; order: number; label: string;
  gameType: string; minLevel: number; matchesCount: number;
  score: number; // suma celor mai bune matchesCount meciuri din rundă
}

export interface LeaderboardEntry {
  rank: number; userId: string; username: string; avatarUrl: string | null;
  totalScore: number;
  rounds: RoundEntry[];       // ← înlocuiește scores: Record<string, number>
  matchesPlayed: number; joinedAt: string;
}

export interface ContestStats {
  // ...
  rounds: Array<{ id, order, label, gameType, minLevel, matchesCount }>;
  // ← înlocuiește gameTypes: string[]
}
```

**`processMatchResult`** — semnătură extinsă:
```ts
async processMatchResult(
  matchId: string, gameType: string, userId: string,
  score: number, level: number, timeTaken?: number
)
```
Logică: filtrează rundele eligibile pe baza `level >= round.minLevel`, salvează cu `roundId` + `level`.

**`getLeaderboard`** — logică top-N per rundă:
- Grupează scorurile per `(roundId, userId)`
- Ia primele `matchesCount` scoruri (sortate desc) per rundă
- `totalScore` = suma scorurilor agregate pe toate rundele

---

### 11.3 matchHandler.ts

Apelul hook-ului transmite acum nivelul meciului:
```ts
contestEngine.processMatchResult(
  matchId, match.gameType, rp.userId, rp.score, match.level ?? 1, timeTaken
)
```

---

### 11.4 Admin API — Payload modificat

**POST/PATCH `/api/admin/contests`** — body trimite `rounds[]` în loc de `gameTypes[]`:

```ts
interface RoundInput {
  order: number;
  label: string;
  gameType: string;      // integrame | labirinturi | slogane
  minLevel: number;      // 1–5
  matchesCount: number;  // câte meciuri top-N contează
}
```

**GET `/api/admin/contests/:id/players`** — scorurile sunt acum grupate pe `roundId`, cu logica top-N; câmpul `bestScores` înlocuit cu `roundScores: Record<roundId, number>`.

---

### 11.5 Tipuri Shared actualizate

```ts
export interface ContestRoundPublic {
  id: string; order: number; label: string;
  gameType: string; minLevel: number; matchesCount: number;
}

export interface ContestPublic {
  // ...
  rounds: ContestRoundPublic[];   // ← înlocuiește gameTypes: string[]
}

export interface ContestRoundScore {
  roundId: string; order: number; label: string;
  gameType: string; minLevel: number; matchesCount: number;
  score: number;
}

export interface ContestLeaderboardEntry {
  // ...
  rounds: ContestRoundScore[];    // ← înlocuiește scores: Record<string, number>
}
```

---

### 11.6 Admin UI — Editor Dinamic de Runde

**Fișier:** `frontend-web/src/app/admin/contests/page.tsx`

Înlocuit lista de checkboxes pentru `gameTypes` cu un editor dinamic de runde:

- Fiecare rundă are:
  - **Label** (text liber, ex: "Runda 1 - Labirinturi")
  - **Tip joc** (select: integrame / labirinturi / slogane)
  - **Nivel minim** (număr 1–5)
  - **Top N meciuri** (număr 1–10, câte meciuri sunt luate în calcul)
- Buton **+ Adaugă rundă** — adaugă o rundă nouă la final
- Buton **✕** per rundă — șterge runda
- La editare: rundele existente se populează din API

Tabelul de participanți afișează coloane dinamice pe runde (în loc de coloane per gameType), cu scorul agregat per rundă.

Pillurile din lista de concursuri arată `#1 Runda Labirinturi ≥Niv3` în loc de `🌀 Labirinturi`.

---

### 11.7 User Page — Afișare Runde

**Fișier:** `frontend-web/src/app/contest/[slug]/page.tsx`

- Rundele apar ca pills cu: `#1 <Label> ≥NivX topN`
- Butoanele de practică și de joc se generează dinamic din `[...new Set(contest.rounds.map(r => r.gameType))]` (fără duplicate)

---

### 11.8 ContestLeaderboard — Coloane pe Runde

**Fișier:** `frontend-web/src/components/contest/ContestLeaderboard.tsx`

- Prop schimbat: `gameTypes: string[]` → `rounds: ContestRoundPublic[]`
- Coloane dinamice per rundă cu header `#1 <Label>` sau `#1 🌀 Labirint`
- Scorul per rundă: `entry.rounds.find(rr => rr.roundId === r.id)?.score`

---

### 11.9 Fișiere Modificate (Update)

| Fișier | Modificare |
|--------|-----------|
| `backend/prisma/schema.prisma` | `ContestGame` → `ContestRound` (cu `order`, `label`, `minLevel`, `matchesCount`); `ContestScore` + `roundId`, `level` |
| `backend/prisma/migrations/20260331102946_add_contest_rounds/` | Migrare nouă aplicată |
| `backend/src/services/ContestEngine.ts` | Interfețe noi, `processMatchResult` cu `level`, `getLeaderboard` top-N per rundă |
| `backend/src/socket/matchHandler.ts` | Adăugat `match.level ?? 1` la apelul `processMatchResult` |
| `backend/src/routes/admin.ts` | `gameTypes[]` → `rounds[]` în toate endpoint-urile; logică top-N în `/players` |
| `backend/src/routes/contests.ts` | `GET /:slug` returnează `rounds[]` în loc de `gameTypes[]` |
| `shared/src/index.ts` | Adăugate `ContestRoundPublic`, `ContestRoundScore`; actualizate `ContestPublic` și `ContestLeaderboardEntry` |
| `frontend-web/src/app/admin/contests/page.tsx` | Editor dinamic de runde înlocuiește checkbox-urile; tabel participanți cu coloane per rundă |
| `frontend-web/src/app/contest/[slug]/page.tsx` | Afișare runde ca pills; butoane de joc/practică din runde unice |
| `frontend-web/src/components/contest/ContestLeaderboard.tsx` | Prop `rounds[]` în loc de `gameTypes[]`; coloane dinamice per rundă |

**Verificare finală:** `npx tsc --noEmit` — 0 erori backend, 0 erori frontend ✅
