# Implementation Checklist – Simulated Players (Integrame)

## Rollout Safety
- [x] schimbări aditive (fără breaking changes)
- [x] feature flags OFF by default
- [x] deploy incremental pe faze

## Faza 1 – Core MVP
### Database
- [x] add `User.userType` (default `REAL`)
- [x] add `AIPlayerProfile`
- [x] add `BotConfig`
- [x] migration + verificare locală
- [x] update `seed.ts` cu 10–30 simulated players

### Config / Flags
- [x] `SIM_PLAYERS_ENABLED=false`
- [x] `GHOST_PLAYERS_ENABLED=false`
- [x] `BOT_CHAT_ENABLED=false`
- [x] `BOT_ACTIVITY_FEED_ENABLED=false`

### Matchmaking
- [x] hook în `backend/src/routes/matches.ts`
- [x] fill sloturi goale după timeout
- [x] join gradual cu delay random
- [x] gameType mapping corect (`maze` / `labirinturi`)

### Behavior Engine
- [x] modul nou `backend/src/services/simulatedPlayers/BehaviorEngine.ts`
- [x] thinking delay per skill
- [x] mistake/correction logic
- [x] hesitation logic
- [x] anti-pattern guard

### Socket Integration
- [x] păstrează `matchHandler.ts` minim modificat
- [x] bot actions emit aceleași evenimente ca players reali
- [x] cleanup corect pentru timers/maps

### Validare Faza 1
- [x] 1 real player în lobby de 4 => se completează la 4
- [x] meciul pornește și rulează fără erori
- [x] persistare scor/rezultat corectă
- [x] cu flags OFF comportamentul vechi rămâne intact

## Faza 2 – Ghost + Adaptation
### Ghost
- [x] add `GhostRun`
- [x] capture async la final de meci
- [x] replay cu timing variation
- [x] selecție ghost pe gameType/dificultate/skill

### Skill Profiling
- [x] add `PlayerSkillProfile`
- [x] track completion/mistakes/success/hints
- [x] update profil la final de meci

### Dynamic Difficulty
- [x] ajustare graduală a skill-ului bot
- [x] guardrails fairness

### Validare Faza 2
- [x] fără blocări pe final de meci
- [x] latență stabilă
- [x] ajustări naturale, non-bruste

## Faza 3 – Admin + UX
### Admin API/UI
- [x] extend `backend/src/routes/admin.ts`
- [x] pages în `frontend-web/src/app/admin/...`
- [x] CRUD AI profile + config global
- [x] management GhostRun
- [x] health + audit trail + effective toggles status

### Feed / Chat / Leaderboard
- [ ] activity feed low-frequency (runtime feature logic)
- [ ] bot chat rar + cooldown (runtime feature logic)
- [ ] `botScoreLimit` aplicat în leaderboard (enforcement complet)

## Observability
- [x] logging decizii matchmaking
- [ ] metrics latență acțiuni bot (p95/event-loop/queue depth)
- [ ] error tracking pe module AI/Ghost (agregat + alerting)

## Definition of Done (MVP)
- [x] Faza 1 completă fără regresii
- [x] flags funcționale
- [x] documentație actualizată
- [x] changelog completat
