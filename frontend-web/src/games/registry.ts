export interface FrontendGameDefinition {
  id: string;
  label: string;
  emoji: string;
  aliases?: string[];
  uiVariant: 'integrame' | 'maze';
  supportsSolo?: boolean;
}

export interface ServerGameDefinition {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  isActive?: boolean;
  order?: number;
}

/**
 * Single source of truth for games on frontend.
 *
 * Pentru a adăuga joc nou:
 * 1) Adaugă aici un nou obiect în GAME_DEFINITIONS
 * 2) Adaugă componenta de UI în GameRenderer (dacă uiVariant nou)
 * 3) Adaugă reguli în @integrame/shared + backend GameRegistry
 */
export const GAME_DEFINITIONS: FrontendGameDefinition[] = [
  { id: 'integrame', label: 'Integrame', emoji: '📝', uiVariant: 'integrame', supportsSolo: true },
  { id: 'labirinturi', label: 'Labirinturi', emoji: '🌀', aliases: ['maze'], uiVariant: 'maze', supportsSolo: true },
  { id: 'slogane', label: 'Slogane', emoji: '💬', uiVariant: 'integrame', supportsSolo: false },
];

export function getSelectableGames(): FrontendGameDefinition[] {
  return GAME_DEFINITIONS;
}

export function getGameByType(gameType: string): FrontendGameDefinition | undefined {
  return GAME_DEFINITIONS.find((game) => game.id === gameType || game.aliases?.includes(gameType));
}

export function toCanonicalGameType(gameType: string): string {
  return getGameByType(gameType)?.id ?? gameType;
}

export function isLabyrinthGameType(gameType: string): boolean {
  return toCanonicalGameType(gameType) === 'labirinturi';
}
