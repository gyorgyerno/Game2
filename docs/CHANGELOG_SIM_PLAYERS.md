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
- **Area:** Observability / Tooling
  - **Summary:** Added runtime metrics monitor (`eventLoopLagMs`, `eventLoopLagP95Ms`, `p95DecisionCpuMs`) and a load-test reporting script for simulated subsystem health sampling.
  - **Reason:** Enable measurable validation for stability/performance hardening and safe rollout decisions.
  - **Impact:** Faster diagnosis under load and repeatable KPI checks with JSON/MD reports.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `BOT_CHAT_ENABLED`, `BOT_ACTIVITY_FEED_ENABLED`

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

### Added
- **Area:** Docs / Observability
  - **Summary:** Added dedicated load-test runbook with commands, KPI thresholds (OK/WARN/CRIT), and troubleshooting flow.
  - **Reason:** Standardize simulated runtime validation and reduce ad-hoc operational decisions.
  - **Impact:** Faster, repeatable diagnostics and clearer go/no-go criteria for rollout.
  - **Flags:** N/A

### Changed
- **Area:** Backend / Observability
  - **Summary:** Excluded `/api/admin/simulated-players/health` from global rate limiter to prevent synthetic 429 during admin health polling load-tests.
  - **Reason:** 10-minute sampling tests were rate-limited by generic API cap, invalidating measurements.
  - **Impact:** Clean long-run metrics collection (`600s`, `errorCount=0`) and reliable stability validation.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `BOT_CHAT_ENABLED`, `BOT_ACTIVITY_FEED_ENABLED`

### Added
- **Area:** Tooling / Observability
  - **Summary:** Added nightly load-test wrapper script (`sim:loadtest:nightly`) with env-based credentials and default 10-minute sampling profile.
  - **Reason:** Make recurring stability checks easy to schedule and execute consistently.
  - **Impact:** Reduces manual operational steps and standardizes nightly KPI collection.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `BOT_CHAT_ENABLED`, `BOT_ACTIVITY_FEED_ENABLED`

### Added
- **Area:** Admin / Observability
  - **Summary:** Added aggregated simulated runtime alerts endpoint (`/api/admin/simulated-players/alerts`) with warn/critical signals for lag, decision p95, error counters and circuit breaker state.
  - **Reason:** Centralize operational visibility and simplify go/no-go checks.
  - **Impact:** Faster diagnosis and clearer runtime health posture for simulated subsystem.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `BOT_CHAT_ENABLED`, `BOT_ACTIVITY_FEED_ENABLED`

### Changed
- **Area:** AI Behavior / Runtime
  - **Summary:** Tuned anti-detection behavior (circadian timing variation + anti-pattern decision repetition guard) and added generator guardrails (backpressure on lag, error aggregation, circuit breaker).
  - **Reason:** Reduce repetitive bot patterns and improve resilience under degraded runtime conditions.
  - **Impact:** More human-like behavior and safer non-critical workload throttling.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `BOT_CHAT_ENABLED`, `BOT_ACTIVITY_FEED_ENABLED`

### Added
- **Area:** Tooling / QA
  - **Summary:** Added `sim:selfcheck` regression script validating admin login + simulated health + alerts payload contracts.
  - **Reason:** Provide minimal repeatable anti-regression check without adding heavy test framework.
  - **Impact:** Faster sanity validation after changes affecting simulated runtime.
  - **Flags:** `SIM_PLAYERS_ENABLED`, `BOT_CHAT_ENABLED`, `BOT_ACTIVITY_FEED_ENABLED`

---

## Template Entry (copy/paste)
### YYYY-MM-DD
#### Added | Changed | Fixed | Removed
- **Area:** <DB | Matchmaking | Socket | AI Behavior | Ghost | Admin | Frontend | Docs>
  - **Summary:** <short technical change>
  - **Reason:** <why>
  - **Impact:** <technical + UX impact>
  - **Flags:** <e.g. SIM_PLAYERS_ENABLED>
