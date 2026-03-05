# Changelog – Simulated Players (Integrame)

Acest fișier păstrează istoricul modificărilor pentru sistemul de simulated players (AI + Ghost), separat de changelog-ul general al proiectului.

## Format intrare
- `Date`: YYYY-MM-DD
- `Type`: Added / Changed / Fixed / Removed
- `Area`: DB / Matchmaking / Socket / AI Behavior / Ghost / Admin / Frontend / Docs
- `Summary`: ce s-a schimbat
- `Reason`: de ce s-a făcut schimbarea
- `Impact`: impact tehnic + impact UX
- `Flags`: feature flags relevante

---

## 2026-03-05
### Added
- **Area:** DB
  - **Summary:** Added additive data model for simulated ecosystem (`User.userType`, `AIPlayerProfile`, `PlayerSkillProfile`, `GhostRun`, `BotConfig`) + migration + seed updates for simulated users.
  - **Reason:** Enable AI/ghost capabilities without breaking existing schema.
  - **Impact:** Introduces persistence layer needed for phased rollout; backward compatible by design.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `GHOST_PLAYERS_ENABLED`

### Added
- **Area:** Matchmaking / AI Behavior
  - **Summary:** Implemented `SimulatedMatchOrchestrator` + `BehaviorEngine` with real > ghost > simulated priority, gradual join, and dynamic difficulty adaptation.
  - **Reason:** Keep lobbies active with believable non-perfect opponent behavior.
  - **Impact:** Better queue fill and smoother multiplayer feel when real-user concurrency is low.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `GHOST_PLAYERS_ENABLED`

### Added
- **Area:** Ghost / Socket
  - **Summary:** Added GhostRun capture on match finalize and ghost candidate selection for matchmaking fills.
  - **Reason:** Reuse real-player patterns for higher realism and lower compute cost.
  - **Impact:** Increases behavioral diversity and perceived authenticity of opponents.
  - **Flags:** `GHOST_PLAYERS_ENABLED`

### Added
- **Area:** Admin / Frontend
  - **Summary:** Added admin APIs and web UI for simulated players config, AI profile CRUD, GhostRun management, health snapshot, audit trail, and effective-toggle diagnostics.
  - **Reason:** Provide operational control, safe toggling, and traceability for rollout.
  - **Impact:** Faster troubleshooting and safer on/off behavior across environments.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `BOT_CHAT_ENABLED`, `BOT_ACTIVITY_FEED_ENABLED`

### Added
- **Area:** AI Behavior / Admin
  - **Summary:** Added runtime generators for activity feed and bot chat with cooldown, config + feature-flag gating, plus admin status/events/test-generate endpoints and UI panels.
  - **Reason:** Enable controlled social simulation behavior without heavy compute or continuous spam.
  - **Impact:** Improves perceived platform activity while keeping rollout safe and observable.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `BOT_CHAT_ENABLED`, `BOT_ACTIVITY_FEED_ENABLED`

### Changed
- **Area:** Leaderboard
  - **Summary:** Enforced `botScoreLimit` in leaderboard responses (global and per-game) for `SIMULATED`/`GHOST` accounts.
  - **Reason:** Prevent simulated accounts from dominating competitive ranking surfaces.
  - **Impact:** Better fairness perception and stronger player trust in rankings.
  - **Flags:** `SIM_PLAYERS_ENABLED`

### Added
- **Area:** Docs
  - **Summary:** Created initial documentation set for simulated players system.
  - **Reason:** Establish a single source of truth before implementation.
  - **Impact:** Better team alignment and safer phased rollout.
  - **Flags:** N/A

### Added
- **Area:** Docs
  - **Summary:** Added master specification document.
  - **Reason:** Capture architecture, principles, and rollout strategy.
  - **Impact:** Reduces implementation ambiguity and regressions.
  - **Flags:** N/A

### Added
- **Area:** Docs
  - **Summary:** Added implementation checklist document.
  - **Reason:** Track phased delivery across backend, socket, admin, and UX.
  - **Impact:** Improves execution predictability and validation discipline.
  - **Flags:** N/A

---

## Template Entry (copy/paste)
### YYYY-MM-DD
#### Added | Changed | Fixed | Removed
- **Area:** <DB | Matchmaking | Socket | AI Behavior | Ghost | Admin | Frontend | Docs>
  - **Summary:** <short technical change>
  - **Reason:** <why>
  - **Impact:** <technical + UX impact>
  - **Flags:** <e.g. SIM_PLAYERS_ENABLED>
