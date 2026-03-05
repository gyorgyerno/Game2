'use client';

import { useEffect, useState } from 'react';
import { gamesApi } from '@/lib/api';
import {
  FrontendGameDefinition,
  ServerGameDefinition,
  getGameByType,
  getSelectableGames,
  toCanonicalGameType,
} from './registry';

function normalizeServerGames(raw: ServerGameDefinition[]): FrontendGameDefinition[] {
  const normalizedWithOrder: Array<{ game: FrontendGameDefinition; order: number }> = [];
  const seenCanonical = new Set<string>();

  for (const game of raw) {
    if (game.isActive === false) continue;

    const canonicalId = toCanonicalGameType(game.id);
    if (seenCanonical.has(canonicalId)) continue;

    const local = getGameByType(game.id);
    if (local) {
      normalizedWithOrder.push({ game: local, order: game.order ?? 999 });
      seenCanonical.add(local.id);
      continue;
    }

    normalizedWithOrder.push({
      game: {
        id: canonicalId,
        label: game.name || canonicalId,
        emoji: game.icon || '🎮',
        uiVariant: 'integrame',
      },
      order: game.order ?? 999,
    });
    seenCanonical.add(canonicalId);
  }

  return normalizedWithOrder
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.game);
}

export function useGamesCatalog(): FrontendGameDefinition[] {
  const [games, setGames] = useState<FrontendGameDefinition[]>(getSelectableGames());

  useEffect(() => {
    let cancelled = false;

    gamesApi.getAll()
      .then((response) => {
        if (cancelled) return;
        const serverGames = Array.isArray(response.data) ? (response.data as ServerGameDefinition[]) : [];
        const normalized = normalizeServerGames(serverGames);
        if (normalized.length > 0) setGames(normalized);
      })
      .catch(() => {
        if (!cancelled) setGames(getSelectableGames());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return games;
}
