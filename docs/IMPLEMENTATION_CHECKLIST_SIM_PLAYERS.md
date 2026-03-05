# Implementation Checklist – Simulated Players (Integrame)

## Rollout Safety
- [ ] schimbări aditive (fără breaking changes)
- [ ] feature flags OFF by default
- [ ] deploy incremental pe faze

## Faza 1 – Core MVP
### Database
- [ ] add `User.userType` (default `REAL`)
- [ ] add `AIPlayerProfile`
- [ ] add `BotConfig`
- [ ] migration + verificare locală
- [ ] update `seed.ts` cu 10–30 simulated players

### Config / Flags
- [ ] `SIM_PLAYERS_ENABLED=false`
- [ ] `GHOST_PLAYERS_ENABLED=false`
- [ ] `BOT_CHAT_ENABLED=false`
- [ ] `BOT_ACTIVITY_FEED_ENABLED=false`

### Matchmaking
- [ ] hook în `backend/src/routes/matches.ts`
- [ ] fill sloturi goale după timeout
- [ ] join gradual cu delay random
- [ ] gameType mapping corect (`maze` / `labirinturi`)

### Behavior Engine
- [ ] modul nou `backend/src/games/ai/BehaviorEngine.ts`
- [ ] thinking delay per skill
- [ ] mistake/correction logic
- [ ] hesitation logic
- [ ] anti-pattern guard

### Socket Integration
- [ ] păstrează `matchHandler.ts` minim modificat
- [ ] bot actions emit aceleași evenimente ca players reali
- [ ] cleanup corect pentru timers/maps

### Validare Faza 1
- [ ] 1 real player în lobby de 4 => se completează la 4
- [ ] meciul pornește și rulează fără erori
- [ ] persistare scor/rezultat corectă
- [ ] cu flags OFF comportamentul vechi rămâne intact

## Faza 2 – Ghost + Adaptation
### Ghost
- [ ] add `GhostRun`
- [ ] capture async la final de meci
- [ ] replay cu timing variation
- [ ] selecție ghost pe gameType/dificultate/skill

### Skill Profiling
- [ ] add `PlayerSkillProfile`
- [ ] track completion/mistakes/success/hints
- [ ] update profil la final de meci

### Dynamic Difficulty
- [ ] ajustare graduală a skill-ului bot
- [ ] guardrails fairness

### Validare Faza 2
- [ ] fără blocări pe final de meci
- [ ] latență stabilă
- [ ] ajustări naturale, non-bruste

## Faza 3 – Admin + UX
### Admin API/UI
- [ ] extend `backend/src/routes/admin.ts`
- [ ] pages în `frontend-web/src/app/admin/...`
- [ ] CRUD AI profile + config global
- [ ] management GhostRun

### Feed / Chat / Leaderboard
- [ ] activity feed low-frequency
- [ ] bot chat rar + cooldown
- [ ] `botScoreLimit` aplicat în leaderboard

## Observability
- [ ] logging decizii matchmaking
- [ ] metrics latență acțiuni bot
- [ ] error tracking pe module AI/Ghost

## Definition of Done (MVP)
- [ ] Faza 1 completă fără regresii
- [ ] flags funcționale
- [ ] documentație actualizată
- [ ] changelog completat
