# 🎯 Integrame – Platformă Multiplayer Competitive

Monorepo complet **Web + Mobile** cu jocuri de cuvinte multiplayer în timp real.

## Stack

| Layer | Tehnologie |
|-------|-----------|
| Backend | Node.js + Express + Socket.io + Prisma |
| Database | MySQL 8 |
| Frontend Web | Next.js 14 + Tailwind CSS |
| Mobile | React Native / Expo |
| Shared | TypeScript types + game rules + score calc |

---

## 🚀 Start rapid (Development)

### 1. Clonează și instalează dependențele
```bash
yarn install
```

### 2. Pornește MySQL (Docker)
```bash
docker-compose up mysql -d
```

### 3. Configurează backend-ul
```bash
cd backend
cp .env.example .env
# Editează .env cu credențialele tale
yarn db:generate
yarn db:migrate
yarn db:seed
```

### 4. Pornește toate serviciile
```bash
# Din rădăcina monorepo
yarn dev
```

- **Frontend web**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Prisma Studio**: `cd backend && yarn db:studio`

---

## 🐳 Docker complet (Producție)

```bash
cp backend/.env.example backend/.env
# Editează .env
docker-compose up -d
```

---

## 📁 Structura proiectului

```
integrame/
├── shared/          # Tipuri TS, reguli JSON, calcul scor/XP/ELO
├── backend/         # API REST + Socket.io + Prisma
│   ├── src/
│   │   ├── routes/  # auth, users, matches, leaderboard, invites, stats
│   │   ├── socket/  # matchHandler cu calcul ELO live
│   │   └── middleware/
│   └── prisma/      # schema.prisma + seed
├── frontend-web/    # Next.js 14 + Tailwind
│   └── src/
│       ├── app/     # pages: /, /login, /register, /dashboard, /profile
│       │             #        /games/[gameType]/play|result|leaderboard
│       │             #        /invite/[code]
│       ├── components/game/  # CrosswordGrid, LetterTiles, PlayerSidebar
│       │                      # AIChatWidget, GameNavbar, GameTimer
│       ├── lib/     # api.ts, socket.ts, puzzles.ts
│       └── store/   # auth.ts (Zustand)
├── mobile-app/      # React Native / Expo
└── docker-compose.yml
```

---

## 🎮 Funcționalități

- ✅ **Auth OTP** – Email + cod 6 cifre
- ✅ **Matchmaking** – Auto-find sau invite link 24h
- ✅ **1–20 jucători** per meci (5 niveluri)
- ✅ **Crossword grid** cu celule mov, litere scramble, timer live
- ✅ **Scor live** via Socket.io pentru toți participanții
- ✅ **XP & ELO** calculate server-side la finalul meciului
- ✅ **Bonusuri poziționale** – primul finisher, top 3, finalizare
- ✅ **Leaderboard** global + per joc + per nivel cu paginare
- ✅ **Statistici** individuale + grafic evoluție ELO
- ✅ **Invite system** – link multi-user, auto-join după register
- ✅ **AI Chat** widget în joc
- ✅ **Anti-cheat** basic + rate limiting

---

## 🎯 Jocuri disponibile

| Joc | Timp | Corect | Greșit | Bonus 1st | Bonus final |
|-----|------|--------|--------|-----------|-------------|
| Integrame | 180s | +10 | -5 | +10 | +20 |
| Slogane | 120s | +15 | -5 | +20 | +25 |

---

## 📱 Mobile (Expo)

```bash
cd mobile-app
yarn install
yarn start
```

Scanează QR cu **Expo Go** pe iOS/Android.
