import { Router } from 'express';
import { gameRegistry } from '../games/GameRegistry';
import prisma from '../prisma';
import { gameLevelConfigService } from '../services/GameLevelConfigService';

const router = Router();

function toCanonicalGameType(gameType: string): string {
  if (gameType === 'maze') return 'labirinturi';
  return gameType;
}

// GET /api/games
router.get('/', async (req, res) => {
  const includeInactive = req.query['includeInactive'] === '1';

  const dbGameTypes = await prisma.gameType.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      iconUrl: true,
      isActive: true,
      displayOrder: true,
    },
  });

  const dbByCanonical = new Map<string, {
    id: string;
    name: string;
    description: string;
    iconUrl: string | null;
    isActive: boolean;
    displayOrder: number | null;
  }>();
  for (const dbGame of dbGameTypes) {
    dbByCanonical.set(toCanonicalGameType(dbGame.id), dbGame);
  }

  const localOrder = new Map<string, number>();
  let currentOrder = 10;
  for (const game of gameRegistry.listAll()) {
    const canonical = toCanonicalGameType(game.meta.id);
    if (!localOrder.has(canonical)) {
      localOrder.set(canonical, currentOrder);
      currentOrder += 10;
    }
  }

  const canonicalGames = new Map<string, {
    id: string;
    name: string;
    description: string;
    icon: string;
    primaryColor: string;
    secondaryColor: string;
    isActive: boolean;
    order: number;
    rules: { timeLimit: number; forfeitBonus: number };
  }>();

  for (const game of gameRegistry.listAll()) {
    const canonical = toCanonicalGameType(game.meta.id);
    if (canonicalGames.has(canonical)) continue;

    const dbGame = dbByCanonical.get(canonical);

    canonicalGames.set(canonical, {
      id: canonical,
      name: dbGame?.name || game.meta.name,
      description: dbGame?.description || game.meta.description,
      icon: dbGame?.iconUrl || game.meta.icon,
      primaryColor: game.meta.primaryColor,
      secondaryColor: game.meta.secondaryColor,
      isActive: dbGame?.isActive ?? true,
      order: dbGame?.displayOrder ?? localOrder.get(canonical) ?? 999,
      rules: {
        timeLimit: game.rules.timeLimit,
        forfeitBonus: game.rules.forfeitBonus,
      },
    });
  }

  const games = Array.from(canonicalGames.values())
    .filter((game) => includeInactive || game.isActive)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return res.json(games);
});

// GET /api/games/levels/:gameType — config publică a nivelelor (fără auth)
// Returnează: [{ level, displayName, winsToUnlock, gamesPerLevel, maxPlayers }]
router.get('/levels/:gameType', async (req, res) => {
  const { gameType } = req.params as { gameType: string };
  const levels = gameLevelConfigService.getActiveLevels(gameType);
  return res.json(
    levels.map((l) => ({
      level: l.level,
      displayName: l.displayName,
      winsToUnlock: l.winsToUnlock,
      gamesPerLevel: l.gamesPerLevel,
      maxPlayers: l.maxPlayers,
    }))
  );
});

// GET /api/games/rules/:gameType — reguli efective (cu override-uri admin)
router.get('/rules/:gameType', (req, res) => {
  const { gameType } = req.params as { gameType: string };
  const rules = gameRegistry.getEffectiveRules(gameType);
  if (!rules) return res.status(404).json({ error: 'Game not found' });
  return res.json({
    timeLimit: rules.timeLimit,
    pointsPerCorrect: rules.pointsPerCorrect,
    pointsPerMistake: rules.pointsPerMistake,
    bonusCompletion: rules.bonusCompletion,
    bonusFirstFinisher: rules.bonusFirstFinisher,
    forfeitBonus: rules.forfeitBonus,
  });
});

export default router;
