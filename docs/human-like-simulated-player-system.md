# Human-Like Simulated Player System (Integrame)

## Scop
Sistem modular de jucători simulați pentru jocuri puzzle multiplayer (`crossword`, `maze/labirinturi`, `numberlink`, extensibil), astfel încât platforma să pară activă când sunt puțini useri reali.

**Principiu central:** realism > eficiență. Bot-urile nu trebuie să joace perfect.

## Tipuri de jucători
- `real_user`
- `simulated_player`
- `ghost_player`

**Prioritate în matchmaking:**
1. real players
2. ghost players
3. simulated AI players

## Arhitectură (high-level)
1. `Player Identity Service`
2. `Behavior Engine`
3. `Game AI Engine` (solver modular per joc)
4. `Ghost Replay Engine`
5. `Smart Matchmaking`
6. `Retention Balancer`
7. `Activity Feed Generator`
8. `Admin AI Panel API`

## Schema DB (draft)
### Enum-uri
- `UserType`: `REAL`, `SIMULATED`, `GHOST`
- `AIPersonality`: `FAST_RISKY`, `SLOW_THINKER`, `CASUAL_PLAYER`, `PERFECTIONIST`, `CHAOTIC_PLAYER`

> Scalability rule: nu bloca extinderea prin enum rigid pentru jocuri. Pentru compatibilitate pe termen lung, păstrează în profile câmpuri bazate pe `gameSlug` (string), iar mapping-ul către engine/UI se face prin registries.

### Modele propuse
- `AIPlayerProfile`
  - `id`, `userId`, `skillLevel`, `thinkingSpeedMsMin`, `thinkingSpeedMsMax`
  - `mistakeRate`, `hesitationProbability`, `correctionProbability`
  - `playStyle`, `personality`, `preferredGames`
  - `onlineProbability`, `chatProbability`
  - `sessionLengthMin`, `sessionLengthMax`, `activityPattern`, `enabled`
- `PlayerSkillProfile`
  - `averageCompletionTime`, `mistakeRate`, `successRate`, `preferredGameTypes`, `winLossRatio`
  - `hintUsageRate`, `correctionRate`, `pathEfficiency`
- `GhostRun`
  - `id`, `playerId`, `gameType`, `difficulty`, `moves`, `timestamps`
  - `mistakes`, `corrections`, `completionTime`, `finalScore`, `createdAt`
- `BotConfig`
  - `enabled`, `maxBotsOnline`, `botScoreLimit`, `activityFeedEnabled`, `chatEnabled`

## Compatibilitate cu structura actuală (anti-break)
- schimbări DB doar aditive; fără rename/drop pe coloane existente
- `User.userType` cu default `REAL`
- integrare matchmaking în flow-ul existent (`routes/matches`), fără logică duplicată
- integrare runtime în `socket/matchHandler` prin orchestrator separat, nu prin refactor masiv
- feature flags OFF by default la deploy inițial

## Contract de extensibilitate pentru jocuri noi
Pentru orice joc nou, sistemul trebuie să funcționeze fără modificări majore în nucleu.

### 1) Registries obligatorii
- backend: game engine în `GameRegistry`
- frontend: UI module în `games/registry`
- AI: solver în `GameAIEngine` mapat după `gameSlug`

### 2) Interfețe stabile
Fiecare joc expune aceleași contracte:
- `validateMove(state, move)`
- `applyMove(state, move)`
- `getMatchResult(state)`
- `solveNextMove(state, aiProfile)`

### 3) Config-driven behavior
Comportamentul AI nu depinde de if/else hardcodat pe joc, ci de config per joc:
- `thinkingDelayRange`
- `mistakePatterns[]`
- `correctionStrategies[]`
- `searchDepthLimit`
- `timeLimitPerMoveMs`

### 4) Fallback generic
Dacă un joc nou nu are încă solver matur:
- folosește `GenericHeuristicSolver`
- limitează dificultatea și marchează intern `beta_solver=true`
- activează doar pentru procent mic de meciuri (canary)

## Behavior Engine (uman-like)
- delay pe mutare în funcție de skill, cu variație random
- ezitare (`hesitationProbability`)
- greșeli ocazionale (`mistakeRate`)
- auto-corecții după 2–4s (`correctionProbability`)
- anti-detection: fără timing identic / perfect gameplay / răspuns instant

## Interfață solver modular
```ts
interface IGameSolver {
  solveNextMove(gameState: unknown, aiProfile: AIPlayerProfile): SolverMove;
}
```

## Ghost Replay
- la final de joc real se salvează un `GhostRun`
- replay cu timing variation:
  - `ghostDelay = originalTime + random(0.5s..1.5s)`

## Matchmaking rules
- completează doar sloturi goale
- intrare graduală (`Player joined`) cu delay 1–4s
- folosește skill band pentru a evita mismatch extrem
- selecția adversarilor se face pe `gameSlug` + skill band + latency band

## Versionare evenimente realtime
Pentru a evita break între backend, web și mobile:
- adaugă `eventVersion` la evenimentele socket noi
- nu schimba payload-ul existent fără backward compatibility
- orice câmp nou trebuie să fie opțional în clienți

## Leaderboard rules
- bot-urile pot apărea, dar fără dominare (`botScoreLimit`)

## Admin panel (MVP)
- CRUD AI profiles
- enable/disable bots global
- set skill/mistake/personality/preferred games
- management pentru ghost runs

## Observability & guardrails (obligatoriu)
- metrici: lobby wait time, bot win rate, correction rate, quit rate
- alerte: bot win rate anormal, latență mare pe move decisions, erori solver
- audit log pentru orice schimbare admin la config AI
- circuit breaker: dacă un solver aruncă erori repetate, fallback pe generic + disable temporar

## Performance budget (scalability)
- decizia AI per mutare: țintă sub 50ms CPU (fără delay-ul uman simulat)
- evită modele grele; folosește euristici + caching de state
- ghost replay și activity feed rulează async (queue/background)
- suport pentru sute de jucători simulați prin scheduling pe tick-uri ușoare

## Bot activation logic (resource-aware)
Boții se activează doar când aduc valoare reală pentru experiență.

### Reguli de activare
- dacă nu există useri reali activi în ultimele `N` minute, nu porni sesiuni bot interactive
- pornește bot matchmaking doar dacă există cel puțin 1 user real în queue/lobby
- folosește cooldown de activare (ex: 30–60s) ca să eviți spike-uri de spawn
- când apar useri reali suficienți, redu gradual boții din cozi/meciuri noi

### Reguli de dezactivare
- dacă CPU/RAM trece de pragul setat, oprește întâi feed/chat bots, apoi spawn de bots noi
- nu întrerupe meciuri deja începute; aplică doar pe sesiuni noi
- timeout automat pentru sesiuni inactive bot (ex: 2–5 minute fără acțiune)

## Capacity model (safe defaults)
Valori inițiale recomandate (ajustabile din config):
- `maxSimulatedPlayersOnline = min(10, realUsersOnline * 1.5)`
- `maxBotMatchesPerTick = 2`
- `botSpawnPerInterval = 1` la fiecare 3–5 secunde
- `maxBotsPerMatch`: doar cât completează sloturile goale

> Pentru început: dacă ai 10 bots target, pornește cu cap real de 4–6 și crești progresiv după metrics.

## Tick scheduler (low overhead)
Nu rula un timer per bot. Folosește scheduler central:
- un singur tick loop (ex: 250ms sau 500ms)
- procesează bot tasks în batch-uri mici
- prioritate task-uri: `in_match_move` > `matchmaking_join` > `presence` > `chat/feed`
- folosește cozi separate per tip de task

Beneficiu: latență predictibilă și overhead redus pe Node event loop.

## Caching & state optimization
- cache pentru snapshot-uri game state read-only (TTL scurt)
- deduplicare calcule solver pe state hash identic
- evită serializare/deserializare mare în bucla de tick
- persistă în DB doar evenimente importante, nu fiecare heartbeat bot

## Rate limits & backpressure
- limită de acțiuni bot pe secundă global și per match
- dacă queue-ul intern crește peste prag, activează backpressure:
  - mărește delay-urile non-critice
  - suspendă temporar chat/feed
  - respinge spawn nou până revine sub prag

## Fail-safe operational
- feature flag global `SIM_PLAYERS_ENABLED` = kill switch instant
- flag separat pentru `BOT_CHAT_ENABLED` și `BOT_ACTIVITY_FEED_ENABLED`
- health endpoint pentru bot scheduler (`queueDepth`, `avgDecisionMs`, `errorRate`)
- auto-disable bot spawn dacă `errorRate` depășește pragul 1–5 minute

## KPI performanță (în plus față de KPI produs)
- `p95 botDecisionCpuMs`
- `eventLoopLagMs`
- `botTaskQueueDepth`
- `spawnToJoinLatencyMs`
- `socketEmitFailureRate`

## Idei extra UX + optimizare (profi)

### UX quick wins
- lobby feedback mai clar: `Estimare start în 8–15s` în loc de simplu „Waiting..."
- progres psihologic în meci: micro-feedback după mutări bune (`Nice chain`, `Good recovery`)
- anti-frustrare: dacă userul pierde 2–3 meciuri la rând, oferă opponent ușor mai permisiv
- onboarding inteligent: primele 1–2 meciuri cu bots mai lenți și mai iertători
- post-match insights: 2–3 recomandări scurte („mai puține corecții”, „folosește hint mai târziu”)

### UX social layer (fără spam)
- feed-ul de activitate să ruleze în ferestre de activitate, nu continuu 24/7
- chat bots doar contextual (start/end meci, momente tensionate), cu cooldown mare
- evită mesaje generice repetate; folosește template pool + random paraphrasing

### Match quality tuning
- target de echilibru: win rate user între 45% și 60% pe sesiuni scurte
- matchmaking cu confidence score (skill + latență + istoric recent)
- evită rematch imediat cu același profil bot (rotație de adversari)

### Optimizări backend cu impact mare
- precompute ușor pentru următoarea mutare în „thinking window” (idle CPU)
- object pooling pentru structuri folosite frecvent în tick loop
- payload socket delta-only (trimite doar ce s-a schimbat în game state)
- batch DB writes pentru telemetrie non-critică (la 1–3s), nu write per event
- sampling pentru logs verbose la trafic mare (ex: 10% din evenimente)

### Auto-scaling logică bot
- dynamic cap în funcție de sănătate sistem:
  - CPU < 55% => cap normal
  - CPU 55–75% => cap redus cu 30%
  - CPU > 75% => freeze spawn + suspend chat/feed
- creșterea bot cap doar dacă `eventLoopLagMs` rămâne stabil în ultimele 5 minute

### Reliability / SRE
- watchdog pentru scheduler: restart soft dacă tick gap depășește pragul
- dead-letter queue pentru task-uri bot eșuate repetat
- fallback mode „minimal bots” când serviciile auxiliare au probleme

### Product analytics (ca să iei decizii corecte)
- cohortă separată: meciuri cu bots vs fără bots
- măsoară impact pe: D1/D7 retention, session length, quit-after-loss, invite rate
- rulează A/B test pentru parametri (delay range, mistake rate, correction rate)
- păstrează un `BotTuningConfig` versionat ca să poți rollback rapid

## Test strategy minimă anti-regresie
- contract tests pentru fiecare solver (`solveNextMove`)
- integration tests matchmaking (real > ghost > simulated)
- socket compatibility tests (web + mobile)
- migration tests Prisma pe snapshot de date existent

## Pseudocod decizie mutare
```text
function decideNextAction(matchState, aiProfile):
  delay = random(aiProfile.thinkingMin, aiProfile.thinkingMax)
  delay = applyNoise(delay, aiProfile.personality)

  if random() < aiProfile.hesitationProbability:
    delay += random(1000, 3000)

  wait(delay)
  move = solver.solveNextMove(matchState, aiProfile)

  if random() < aiProfile.mistakeRate:
    move = injectSuboptimalMove(move)

    if random() < aiProfile.correctionProbability:
      wait(random(2000, 4000))
      move = correctiveMove(matchState, aiProfile)

  return move
```

## Faze implementare
### Faza 1
- schema DB aditivă + migrații
- feature flags OFF by default
- matchmaking fill slots cu AI
- behavior engine MVP
- contract stabil pentru `gameSlug` + registry mapping

### Faza 2
- ghost capture/replay
- player skill profiling
- adaptare dinamică dificultate

### Faza 3
- admin panel complet
- activity feed + bot chat
- tuning anti-detection + load tests

## KPI de validare
- lobby wait time ↓
- retenție D1/D7 ↑
- abandon rate ↓
- feedback negativ despre boți evidenți ↓
