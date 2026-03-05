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
- `GameType`: `CROSSWORD`, `MAZE`, `NUMBERLINK`, `FUTURE`

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

## Leaderboard rules
- bot-urile pot apărea, dar fără dominare (`botScoreLimit`)

## Admin panel (MVP)
- CRUD AI profiles
- enable/disable bots global
- set skill/mistake/personality/preferred games
- management pentru ghost runs

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
