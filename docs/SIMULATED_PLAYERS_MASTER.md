# Simulated Players System – Master Document

## Scop
Document central pentru sistemul de jucători simulați (AI + Ghost), ca să păstrăm clar:
- ce am decis
- de ce am decis
- ce e implementat
- ce urmează

## Context
- Platformă: Integrame
- Jocuri: crossword, maze/labirinturi, numberlink (extensibil)
- Obiectiv: experiență multiplayer credibilă la activitate redusă

## Principii
- realism > perfecțiune
- bot-uri imperfecte (delay, ezitare, greșeli, corecții)
- anti-detection obligatoriu
- rollout gradual cu feature flags

## Tipuri de jucători
- `real_user`
- `simulated_player`
- `ghost_player`

Prioritate matchmaking:
1. real_user
2. ghost_player
3. simulated_player

## Decizii arhitecturale
1. DB changes aditive, fără breaking changes
2. Feature flags default OFF
3. Integrare minim-invazivă în flow-ul existent
4. Ghost replay async
5. Leaderboard cu limită pentru bot-uri

## Structuri principale
- `AIPlayerProfile`
- `PlayerSkillProfile`
- `GhostRun`
- `BotConfig`
- extensie `User.userType` (default `REAL`)

## Feature flags
- `SIM_PLAYERS_ENABLED=false`
- `GHOST_PLAYERS_ENABLED=false`
- `BOT_CHAT_ENABLED=false`
- `BOT_ACTIVITY_FEED_ENABLED=false`

## Status implementare
### Faza 1 (Core)
- [ ] Migrații DB aditive
- [ ] Seed AI users/profiles
- [ ] Matchmaking fill slots cu AI
- [ ] Behavior engine MVP

### Faza 2
- [ ] Ghost capture/replay
- [ ] Skill profiling + adaptation
- [ ] Stabilizare performanță

### Faza 3
- [ ] Admin panel complet
- [ ] Activity feed + bot chat
- [ ] Tuning anti-detection + load tests

## Fișiere țintă în repo
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/src/routes/matches.ts`
- `backend/src/socket/matchHandler.ts`
- `backend/src/routes/admin.ts`
- `frontend-web/src/app/admin/...`

## Reguli anti-detection
- fără timing identic
- fără răspuns instant
- fără perfecțiune constantă
- fără pattern repetitiv între sesiuni

## KPI
- timp mediu de așteptare lobby
- retenție D1 / D7
- fairness perceput
- feedback negativ despre bot-uri

## Change Log
### 2026-03-05
- creat document master pentru Simulated Players System
- definit scope, principii, faze și fișiere țintă

## Următorii pași
1. Adăugare modele DB (aditiv)
2. Introducere feature flags
3. MVP matchmaking fill cu simulated players (OFF by default)
