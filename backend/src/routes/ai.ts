import { Router, Response } from 'express';
import OpenAI from 'openai';
import { requireAuth, AuthRequest } from '../middleware/auth';
import logger from '../logger';

const router = Router();

// ─── In-memory puzzle cache (matchId → puzzle) ────────────────────────────────
export interface CrosswordWord {
  id: number;
  word: string;
  clue: string;
  row: number;
  col: number;
  direction: 'horizontal' | 'vertical';
}
export interface CrosswordPuzzle {
  title: string;
  rows: number;
  cols: number;
  mainCol: number;
  words: CrosswordWord[];
}

const puzzleCache = new Map<string, CrosswordPuzzle>();

// ─── Fallback puzzles (când nu e OPENAI_API_KEY) ─────────────────────────────
const FALLBACK_PUZZLES: Array<{
  title: string;
  mainWord: string;
  mainWordClue: string;
  horizontalWords: Array<{ word: string; clue: string; crossIndex: number }>;
}> = [
  {
    // PADURE: P(0),A(1),D(2),U(3),R(4),E(5)
    title: 'Natură și frumusețe',
    mainWord: 'PADURE',
    mainWordClue: 'Zonă întinsă acoperită cu copaci',
    horizontalWords: [
      { word: 'CAMP',  clue: 'Teren agricol deschis',          crossIndex: 3 }, // CAMP[3]=P = P(0) ✓ col=2
      { word: 'ALUNA', clue: 'Fruct de pădure cu coajă tare',  crossIndex: 4 }, // ALUNA[4]=A = A(1) ✓ col=1
      { word: 'BRAD',  clue: 'Copac de Crăciun',               crossIndex: 3 }, // BRAD[3]=D = D(2) ✓ col=2
      { word: 'URSU',  clue: 'Animal mare din pădure',         crossIndex: 3 }, // URSU[3]=U = U(3) ✓ col=2
      { word: 'RAZA',  clue: 'Fascicul de lumină',             crossIndex: 0 }, // RAZA[0]=R = R(4) ✓ col=5
      { word: 'ENORM', clue: 'Foarte mare',                    crossIndex: 0 }, // ENORM[0]=E = E(5) ✓ col=5
    ],
  },
  {
    // VULPE: V(0),U(1),L(2),P(3),E(4)
    title: 'Animale din România',
    mainWord: 'VULPE',
    mainWordClue: 'Animal viclean cu blana roșcată',
    horizontalWords: [
      { word: 'BIVOL',  clue: 'Animal de tracțiune cu coarne', crossIndex: 2 }, // BIVOL[2]=V = V(0) ✓ col=3
      { word: 'NUCA',   clue: 'Fruct cu coajă verde',          crossIndex: 1 }, // NUCA[1]=U  = U(1) ✓ col=4
      { word: 'PALMA',  clue: 'Parte a mâinii',                crossIndex: 2 }, // PALMA[2]=L = L(2) ✓ col=3
      { word: 'PIPER',  clue: 'Condiment iute',                crossIndex: 0 }, // PIPER[0]=P = P(3) ✓ col=5
      { word: 'ELICE',  clue: 'Parte rotativă a unui avion',   crossIndex: 4 }, // ELICE[4]=E = E(4) ✓ col=1
    ],
  },
  {
    // SARMALE: S(0),A(1),R(2),M(3),A(4),L(5),E(6)
    title: 'În bucătărie',
    mainWord: 'SARMALE',
    mainWordClue: 'Mâncare tradițională românească învelită în foi de varză',
    horizontalWords: [
      { word: 'SUPA',     clue: 'Lichid cald gătit la oală',     crossIndex: 0 }, // SUPA[0]=S     = S(0) ✓
      { word: 'OALA',     clue: 'Vas de gătit',                   crossIndex: 1 }, // OALA[1]=A     = A(1) ✓ col=4
      { word: 'RANT',     clue: 'Grăsime topită pentru gătit',    crossIndex: 0 }, // RANT[0]=R     = R(2) ✓
      { word: 'MARAR',    clue: 'Plantă aromatică verde',         crossIndex: 0 }, // MARAR[0]=M    = M(3) ✓
      { word: 'ALUAT',    clue: 'Baza pentru pâine',              crossIndex: 0 }, // ALUAT[0]=A    = A(4) ✓
      { word: 'LAPTE',    clue: 'Lichid alb de la vacă',          crossIndex: 0 }, // LAPTE[0]=L    = L(5) ✓
      { word: 'EPRUBETA', clue: 'Tub de sticlă din laborator',    crossIndex: 0 }, // EPRUBETA[0]=E = E(6) ✓
    ],
  },
  {
    // FOTBAL: F(0),O(1),T(2),B(3),A(4),L(5)
    title: 'Sport și mișcare',
    mainWord: 'FOTBAL',
    mainWordClue: 'Sport în care se dă cu piciorul în minge',
    horizontalWords: [
      { word: 'FORTA', clue: 'Putere fizică',                         crossIndex: 0 }, // FORTA[0]=F = F(0) ✓
      { word: 'ORAS',  clue: 'Localitate mare',                       crossIndex: 0 }, // ORAS[0]=O  = O(1) ✓
      { word: 'TUR',   clue: 'Tur de teren, un circuit',              crossIndex: 0 }, // TUR[0]=T   = T(2) ✓
      { word: 'BAT',   clue: 'Unealtă de lovit mingea în baseball',   crossIndex: 0 }, // BAT[0]=B   = B(3) ✓
      { word: 'ALERG', clue: 'A fugi, a alerga',                      crossIndex: 0 }, // ALERG[0]=A = A(4) ✓
      { word: 'LOC',   clue: 'Spațiu, poziție',                       crossIndex: 0 }, // LOC[0]=L   = L(5) ✓
    ],
  },
  {
    title: 'Geografie românească',
    mainWord: 'CARPATI',
    mainWordClue: 'Lanț muntos ce traversează România',
    horizontalWords: [
      { word: 'CLOC', clue: 'Sunet scos de o cloșcă',                     crossIndex: 0 }, // CLOC[0]=C = C(0) ✓
      { word: 'BARA', clue: 'Piesă rigidă de metal sau lemn',             crossIndex: 1 }, // BARA[1]=A = A(1) ✓ col=4
      { word: 'RAPA', clue: 'Pantă abruptă',                              crossIndex: 0 }, // RAPA[0]=R = R(2) ✓
      { word: 'PANA', clue: 'Defecțiune la un vehicul',                   crossIndex: 0 }, // PANA[0]=P = P(3) ✓
      { word: 'ARTA', clue: 'Creație estetică',                           crossIndex: 0 }, // ARTA[0]=A = A(4) ✓
      { word: 'TROC', clue: 'Schimb de bunuri fără bani',                 crossIndex: 0 }, // TROC[0]=T = T(5) ✓
      { word: 'IRIS', clue: 'Floare violet sau parte a ochiului',         crossIndex: 0 }, // IRIS[0]=I = I(6) ✓
    ],
  },
];

function buildPuzzle(def: typeof FALLBACK_PUZZLES[0]): CrosswordPuzzle {
  const mainWord = def.mainWord.toUpperCase();
  const MAIN_COL = 5;
  const START_ROW = 1;

  const words: CrosswordWord[] = [];

  // Vertical main word
  words.push({
    id: 0,
    word: mainWord,
    clue: def.mainWordClue,
    row: START_ROW,
    col: MAIN_COL,
    direction: 'vertical',
  });

  // Horizontal words
  def.horizontalWords.forEach((hw, i) => {
    const word = hw.word.toUpperCase();
    const row = START_ROW + i;
    const col = MAIN_COL - hw.crossIndex;
    words.push({ id: i + 1, word, clue: hw.clue, row, col, direction: 'horizontal' });
  });

  const maxCol = Math.max(...words.map((w) =>
    w.direction === 'horizontal' ? w.col + w.word.length : w.col + 1
  ));
  const maxRow = START_ROW + mainWord.length;
  const cols = maxCol + 2;
  const rows = maxRow + 2;

  return { title: def.title, rows, cols, mainCol: MAIN_COL, words };
}

// ─── AI Themes ─────────────────────────────────────────────────────────────
const AI_THEMES: Record<string, string> = {
  general:    'general, orice temă interesantă',
  stiinta:    'știință, tehnologie, inventii',
  film:       'filme, actori, cinema',
  sport:      'sport, atletism, competiții',
  geografie:  'geografie, țări, capitale, relief',
  muzica:     'muzică, instrumente, genuri muzicale',
  gastronomie:'gastronomie, mâncare, rețete',
  natura:     'natură, animale, plante, ecosisteme',
  istorie:    'istorie, personalități, evenimente istorice',
};

function eloToDifficultyHint(elo: number): string {
  if (elo < 900)  return 'Jucătorul este începător, folosește cuvinte foarte simple și comune.';
  if (elo < 1100) return 'Jucătorul este la nivel mediu, cuvinte uzuale.';
  if (elo < 1300) return 'Jucătorul este avansat, poți folosi cuvinte mai rare.';
  return 'Jucătorul este expert, folosește cuvinte specializate și dificile.';
}

// ─── Level constraints ───────────────────────────────────────────────────────
const LEVEL_CONFIG: Record<number, { minWords: number; maxWords: number; hMinLen: number; hMaxLen: number; difficulty: string }> = {
  1: { minWords: 4, maxWords: 6,  hMinLen: 3, hMaxLen: 5,  difficulty: 'ușor, cuvinte simple și foarte comune' },
  2: { minWords: 6, maxWords: 8,  hMinLen: 4, hMaxLen: 6,  difficulty: 'ușor-mediu, cuvinte uzuale' },
  3: { minWords: 8, maxWords: 10, hMinLen: 4, hMaxLen: 7,  difficulty: 'mediu, cuvinte variate' },
  4: { minWords: 10, maxWords: 12, hMinLen: 5, hMaxLen: 8, difficulty: 'dificil, cuvinte mai rare' },
  5: { minWords: 12, maxWords: 16, hMinLen: 5, hMaxLen: 9, difficulty: 'foarte dificil, cuvinte specializate sau compuse' },
};

// ─── OpenAI generation ────────────────────────────────────────────────────────
async function generateWithAI(level: number = 1, theme: string = 'general', elo: number = 1000): Promise<CrosswordPuzzle> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('No OPENAI_API_KEY');

  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
  const openai = new OpenAI({ apiKey });
  const themeDesc = AI_THEMES[theme] || AI_THEMES['general'];
  const eloHint = eloToDifficultyHint(elo);

  const systemPrompt = `Ești un expert în crearea integramelor românești. 
Generează o integramă cu un cuvânt vertical principal și cuvinte orizontale care să se intersecteze cu el.
Răspunde DOAR cu JSON valid, fără text suplimentar.`;

  const userPrompt = `Generează o integramă românească de nivel ${level} cu tema: ${themeDesc}.
${eloHint}
- Un cuvânt vertical principal de exact ${cfg.minWords}-${cfg.maxWords} litere
- Câte un cuvânt orizontal pentru fiecare literă a cuvântului vertical (deci ${cfg.minWords}-${cfg.maxWords} cuvinte orizontale)
- Fiecare cuvânt orizontal trebuie să conțină litera verticală la poziția indicată de "crossIndex" (0-based)

Returnează exact acest format JSON:
{
  "title": "Titlu temă puzzle",
  "mainWord": "CUVANT",
  "mainWordClue": "Definiția cuvântului vertical",
  "horizontalWords": [
    { "word": "EXEMPLU", "clue": "Definiție", "crossIndex": 2 }
  ]
}

Reguli STRICTE:
- Toate cuvintele în limba română, cu majuscule, FĂRĂ diacritice (A nu Ă, I nu Î, S nu Ș etc.)
- mainWord să aibă exact ${cfg.minWords}-${cfg.maxWords} litere
- Cuvintele orizontale să aibă ${cfg.hMinLen}-${cfg.hMaxLen} litere
- crossIndex să fie corect: word[crossIndex] trebuie să fie EXACT litera corespunzătoare din mainWord
- Dificultate: ${cfg.difficulty}`;
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9,
    max_tokens: 1200,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty AI response');

  const parsed = JSON.parse(raw);

  // Validate intersections
  const mainWord: string = parsed.mainWord.toUpperCase();
  for (let i = 0; i < parsed.horizontalWords.length; i++) {
    const hw = parsed.horizontalWords[i];
    const word = hw.word.toUpperCase();
    const expectedLetter = mainWord[i];
    if (!expectedLetter) throw new Error(`Prea multe cuvinte orizontale pentru ${mainWord}`);
    if (word[hw.crossIndex] !== expectedLetter) {
      throw new Error(`Intersecție greșită: ${word}[${hw.crossIndex}] != ${expectedLetter}`);
    }
  }

  return buildPuzzle({ ...parsed });
}

// ─── POST /api/ai/generate-puzzle ────────────────────────────────────────────
router.post('/generate-puzzle', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const { matchId, level = 1, theme = 'general', elo = 1000 } = (req as import('express').Request).body as {
    matchId?: string; level?: number; theme?: string; elo?: number;
  };

  // Return cached if already generated for this match
  if (matchId && puzzleCache.has(matchId)) {
    return res.json(puzzleCache.get(matchId));
  }

  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];

  try {
    let puzzle: CrosswordPuzzle;

    try {
      puzzle = await generateWithAI(level, theme, elo);
      logger.info('AI puzzle generated successfully', { level, theme, elo });
    } catch (aiError: any) {
      // Fallback: alege puzzle-uri din FALLBACK_PUZZLES compatibile cu nivelul
      logger.warn('AI generation failed, using fallback', { error: aiError.message, level });
      const compatible = FALLBACK_PUZZLES.filter((p) => {
        const wc = p.horizontalWords.length;
        return wc >= cfg.minWords && wc <= cfg.maxWords;
      });
      const pool = compatible.length > 0 ? compatible : FALLBACK_PUZZLES;
      puzzle = buildPuzzle(pool[Math.floor(Math.random() * pool.length)]);
    }

    if (matchId) {
      puzzleCache.set(matchId, puzzle);
      // Auto-cleanup after 2 hours
      setTimeout(() => puzzleCache.delete(matchId), 2 * 60 * 60 * 1000);
    }

    return res.json(puzzle);
  } catch (err) {
    logger.error('generate-puzzle error', { err });
    return res.status(500).json({ error: 'Eroare la generarea puzzle-ului' });
  }
});

// ─── GET /api/ai/themes ─────────────────────────────────────────────────────────────────
router.get('/themes', (_req, res: Response) => {
  return res.json(Object.keys(AI_THEMES));
});

// ─── GET /api/ai/puzzle/:matchId ─────────────────────────────────────────────
router.get('/puzzle/:matchId', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const { matchId } = (req as import('express').Request).params;
  const puzzle = puzzleCache.get(matchId);
  if (!puzzle) return res.status(404).json({ error: 'Puzzle negăsit' });
  return res.json(puzzle);
});

export default router;
