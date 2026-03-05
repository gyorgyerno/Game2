# Frontend Games Registry

Single source of truth: `src/games/registry.ts`.
Runtime source (preferred): `GET /api/games` via `useGamesCatalog()`.

## Add a new game (safe flow)

1. Add game definition in `registry.ts`:
   - `id`, `label`, `emoji`
   - optional `aliases`
   - `uiVariant` (`integrame` or `maze`, or add a new variant)
2. Add/plug UI component in `GameRenderer.tsx` for the chosen `uiVariant`.
3. Add game rules in `shared/src/index.ts` (`GAME_RULES`).
4. Register backend game in `backend/src/games/GameRegistry.ts`.
5. Validate with `npm run build` in `frontend-web` and `backend`.

## Dynamic catalog behavior

- `useGamesCatalog()` first tries backend `GET /api/games`.
- If backend is unavailable, UI falls back to `registry.ts`.
- Aliases are deduplicated (example: `maze` is treated as `labirinturi`).

## Why this registry

- Avoids duplicated hardcoded lists in dashboard/navbar/profile.
- Supports aliases (example: `maze` -> `labirinturi`) without breaking old routes.
- Makes game onboarding predictable and low-risk.
