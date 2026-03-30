export interface FrontendGameDefinition {
  id: string;
  label: string;
  emoji: string;
  aliases?: string[];
  uiVariant: 'integrame' | 'maze';
  supportsSolo?: boolean;
  /** Scurtă descriere a regulilor, afișată în lobby */
  howToPlay?: string;
  /** Hint comenzi input afișat în lobby */
  controlsHint?: string;
  /** Culoare accent pentru lobby (clasa Tailwind fără prefix) */
  accentColor?: 'violet' | 'emerald' | 'sky' | 'orange';
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
  {
    id: 'integrame',
    label: 'Integrame',
    emoji: '📝',
    uiVariant: 'integrame',
    supportsSolo: true,
    accentColor: 'violet',
    howToPlay: 'Ghicește cuvintele orizontale pentru a descoperi cuvântul vertical ascuns.',
    controlsHint: 'Click pe un cuvânt → tastează literele',
  },
  {
    id: 'labirinturi',
    label: 'Labirinturi',
    emoji: '🌀',
    aliases: ['maze'],
    uiVariant: 'maze',
    supportsSolo: true,
    accentColor: 'emerald',
    howToPlay: 'Navighează bila prin labirint de la intrare la ieșire. Colectează bonusuri pe drum.',
    controlsHint: 'Săgeți / WASD · Swipe · Click & Drag',
  },
  {
    id: 'slogane',
    label: 'Slogane',
    emoji: '💬',
    uiVariant: 'integrame',
    supportsSolo: false,
    accentColor: 'sky',
    howToPlay: 'Ghicește sloganul brandului din indicii.',
    controlsHint: 'Click pe literă sau tastează',
  },
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
