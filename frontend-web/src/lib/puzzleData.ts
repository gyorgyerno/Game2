/**
 * Integrame puzzle data — 5 levels × 3 games each.
 *
 * Structure:
 *  - Each puzzle has N horizontal words.
 *  - Each horizontal word crosses the `mainCol` column at a specific letter position.
 *  - Reading mainCol top-to-bottom reveals the `secret` word (the final answer).
 */
import type { CrosswordPuzzle, CrosswordWord } from '@/components/game/CrosswordGrid';

export interface IntramePuzzle extends CrosswordPuzzle {
  secret: string;   // the vertical secret word formed by mainCol letters
  levelNum: number;
  gameIndex: number; // 0-based within its level
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

interface WordDef {
  word: string;
  clue: string;
  row: number;
  /** 0-based index of the letter that lands on mainCol */
  letterIdx: number;
}

function build(
  id: string,
  secret: string,
  mainCol: number,
  defs: WordDef[],
  levelNum: number,
  gameIndex: number,
): IntramePuzzle {
  // Guard: verify secret matches intersection letters
  if (process.env.NODE_ENV !== 'production') {
    defs.forEach((d, i) => {
      const letter = d.word[d.letterIdx]?.toUpperCase();
      const expected = secret[i]?.toUpperCase();
      if (letter !== expected) {
        console.error(
          `[puzzleData] "${id}" word "${d.word}" idx ${d.letterIdx} = ${letter}, expected secret[${i}] = ${expected}`
        );
      }
    });
  }

  const words: CrosswordWord[] = defs.map((d, i) => ({
    id: i + 1,
    word: d.word.toUpperCase(),
    clue: d.clue,
    row: d.row,
    col: mainCol - d.letterIdx,
    direction: 'horizontal' as const,
  }));

  const maxRow = Math.max(...defs.map((d) => d.row));
  const maxCol = Math.max(...words.map((w) => w.col + w.word.length - 1));

  return {
    title: `Nivel ${levelNum} – Joc ${gameIndex + 1}`,
    secret: secret.toUpperCase(),
    mainCol,
    rows: maxRow + 1,
    cols: maxCol + 1,
    words,
    levelNum,
    gameIndex,
  };
}

// ---------------------------------------------------------------------------
// LEVEL 1 — 2 words each, mainCol = 3
// ---------------------------------------------------------------------------

const L1G1 = build('1-1', 'DA', 3, [
  { word: 'DRUM', clue: 'Cale pe care mergi', row: 0, letterIdx: 0 },
  { word: 'CANA', clue: 'Vas cu toartă pentru băut', row: 2, letterIdx: 1 },
], 1, 0);

const L1G2 = build('1-2', 'OR', 3, [
  { word: 'BORA', clue: 'Vânt puternic și rece', row: 0, letterIdx: 1 },
  { word: 'FARD', clue: 'Produs cosmetic pentru față', row: 2, letterIdx: 2 },
], 1, 1);

const L1G3 = build('1-3', 'AN', 3, [
  { word: 'VALE', clue: 'Depresiune de teren între munți', row: 0, letterIdx: 1 },
  { word: 'BINE', clue: 'Opusul lui "rău"', row: 2, letterIdx: 2 },
], 1, 2);

// ---------------------------------------------------------------------------
// LEVEL 2 — 5 words each, mainCol = 4
// ---------------------------------------------------------------------------

const L2G1 = build('2-1', 'IARNA', 4, [
  { word: 'BICI',  clue: 'Instrument pentru mânat caii',     row: 0, letterIdx: 1 },
  { word: 'VARA',  clue: 'Anotimp cald',                      row: 2, letterIdx: 1 },
  { word: 'ORAS',  clue: 'Localitate urbană',                 row: 4, letterIdx: 1 },
  { word: 'VANT',  clue: 'Curent de aer',                     row: 6, letterIdx: 2 },
  { word: 'PATA',  clue: 'Urmă colorată pe o suprafață',      row: 8, letterIdx: 1 },
], 2, 0);

const L2G2 = build('2-2', 'MUNTE', 4, [
  { word: 'MAMI',  clue: 'Mama în limbaj copilăresc',          row: 0, letterIdx: 0 },
  { word: 'GURU',  clue: 'Maestru spiritual sau expert',       row: 2, letterIdx: 1 },
  { word: 'MANA',  clue: 'Hrană miraculoasă biblică',         row: 4, letterIdx: 2 },
  { word: 'RATA',  clue: 'Pasăre de apă domestică',           row: 6, letterIdx: 2 },
  { word: 'BERE',  clue: 'Băutură din hamei și malț',         row: 8, letterIdx: 1 },
], 2, 1);

const L2G3 = build('2-3', 'FLORI', 4, [
  { word: 'FATA',  clue: 'Copil de gen feminin',               row: 0, letterIdx: 0 },
  { word: 'GALA',  clue: 'Eveniment festiv și elegant',        row: 2, letterIdx: 2 },
  { word: 'BOLTA', clue: 'Arcadă sau tavan curbat',           row: 4, letterIdx: 1 },
  { word: 'MARA',  clue: 'Prenume feminin tradițional',        row: 6, letterIdx: 2 },
  { word: 'MICI',  clue: 'Cârnați subțiri în mâncare',        row: 8, letterIdx: 1 },
], 2, 2);

// ---------------------------------------------------------------------------
// LEVEL 3 — 7 words each, mainCol = 5
// ---------------------------------------------------------------------------

const L3G1 = build('3-1', 'ROMANIA', 5, [
  { word: 'BARCA', clue: 'Ambarcațiune mică',              row:  0, letterIdx: 2 },
  { word: 'VAPOR', clue: 'Navă cu aburi',                   row:  2, letterIdx: 3 },
  { word: 'LAMPA', clue: 'Sursă de lumină',                 row:  4, letterIdx: 2 },
  { word: 'CREMA', clue: 'Preparat cremos cosmetic',        row:  6, letterIdx: 4 },
  { word: 'BANCA', clue: 'Instituție financiară',           row:  8, letterIdx: 2 },
  { word: 'BARIL', clue: 'Butoi mare pentru lichide',       row: 10, letterIdx: 3 },
  { word: 'FIRMA', clue: 'Societate comercială',            row: 12, letterIdx: 4 },
], 3, 0);

const L3G2 = build('3-2', 'ANIMALE', 5, [
  { word: 'CARNE', clue: 'Aliment din mușchi de animal',    row:  0, letterIdx: 1 },
  { word: 'BANDA', clue: 'Grup de muzicieni',               row:  2, letterIdx: 2 },
  { word: 'COPII', clue: 'Persoane tinere',                  row:  4, letterIdx: 3 },
  { word: 'MARFA', clue: 'Produse comerciale',              row:  6, letterIdx: 0 },
  { word: 'TABLA', clue: 'Suprafață plată de scris',        row:  8, letterIdx: 4 },
  { word: 'BALET', clue: 'Dans clasic pe vârfuri',          row: 10, letterIdx: 2 },
  { word: 'BERE',  clue: 'Băutură alcoolică din hamei',     row: 12, letterIdx: 1 },
], 3, 1);

const L3G3 = build('3-3', 'PASAREA', 5, [
  { word: 'LAMPE', clue: 'Surse de lumină (plural)',        row:  0, letterIdx: 3 },
  { word: 'MANTA', clue: 'Haină lungă de protecție',        row:  2, letterIdx: 4 },
  { word: 'TENIS', clue: 'Sport cu rachetă și minge',       row:  4, letterIdx: 4 },
  { word: 'DRAMA', clue: 'Piesă de teatru cu conflicte',    row:  6, letterIdx: 2 },
  { word: 'UMAR',  clue: 'Articulație a brațului',          row:  8, letterIdx: 3 },
  { word: 'FIBRE', clue: 'Fire textile (plural)',            row: 10, letterIdx: 4 },
  { word: 'SERIA', clue: 'Succesiune ordonată de elemente', row: 12, letterIdx: 4 },
], 3, 2);

// ---------------------------------------------------------------------------
// LEVEL 4 — 9 words each, mainCol = 5
// ---------------------------------------------------------------------------

const L4G1 = build('4-1', 'FOTBALIST', 5, [
  { word: 'BUFON', clue: 'Clovn de curte medievală',         row:  0, letterIdx: 2 },
  { word: 'CAROS', clue: 'Culoare la cărțile de joc',        row:  2, letterIdx: 3 },
  { word: 'BRAT',  clue: 'Membru superior al corpului',      row:  4, letterIdx: 3 },
  { word: 'BOMBA', clue: 'Dispozitiv exploziv',              row:  6, letterIdx: 0 },
  { word: 'PRADA', clue: 'Captură a unui prădător',          row:  8, letterIdx: 2 },
  { word: 'BALOT', clue: 'Snop legat de paie sau fân',       row: 10, letterIdx: 2 },
  { word: 'MEDIU', clue: 'Domeniu de viață sau mijlociu',    row: 12, letterIdx: 3 },
  { word: 'BATOS', clue: 'Înfumurat, fanfaron',              row: 14, letterIdx: 4 },
  { word: 'PIVOT', clue: 'Element central de susținere',     row: 16, letterIdx: 4 },
], 4, 0);

const L4G2 = build('4-2', 'BUCURESTI', 5, [
  { word: 'COBRA', clue: 'Șarpe veninos tropical',           row:  0, letterIdx: 2 },
  { word: 'GRAUR', clue: 'Pasăre migratoare neagră cu pete', row:  2, letterIdx: 3 },
  { word: 'DULCE', clue: 'Gust plăcut, opus lui "amar"',     row:  4, letterIdx: 3 },
  { word: 'BANUT', clue: 'Monedă mică',                      row:  6, letterIdx: 3 },
  { word: 'RADAR', clue: 'Aparat de detecție la distanță',   row:  8, letterIdx: 4 },
  { word: 'PIELE', clue: 'Învelișul exterior al corpului',   row: 10, letterIdx: 2 },
  { word: 'BLUSA', clue: 'Cămașă lejeră feminină',           row: 12, letterIdx: 3 },
  { word: 'COTET', clue: 'Adăpost pentru păsări de curte',   row: 14, letterIdx: 4 },
  { word: 'DRACI', clue: 'Demoni, diavoli (plural)',         row: 16, letterIdx: 4 },
], 4, 1);

const L4G3 = build('4-3', 'PRIETENIE', 5, [
  { word: 'CAMPIA', clue: 'Teren jos și neted (câmpie)',     row:  0, letterIdx: 3 },
  { word: 'FLORA',  clue: 'Vegetația unei regiuni',           row:  2, letterIdx: 3 },
  { word: 'LINII',  clue: 'Trasaturi drepte (plural)',        row:  4, letterIdx: 3 },
  { word: 'MARE',   clue: 'Întindere mare de apă sărată',    row:  6, letterIdx: 3 },
  { word: 'ATLAS',  clue: 'Colecție de hărți geografice',    row:  8, letterIdx: 1 },
  { word: 'CAFEA',  clue: 'Băutură aromatică din boabe',     row: 10, letterIdx: 3 },
  { word: 'TANGO',  clue: 'Dans originar din Argentina',     row: 12, letterIdx: 2 },
  { word: 'TACIT',  clue: 'Nerostit, subînțeles',            row: 14, letterIdx: 3 },
  { word: 'STIRE',  clue: 'Informație de actualitate',       row: 16, letterIdx: 4 },
], 4, 2);

// ---------------------------------------------------------------------------
// LEVEL 5 — 12 words each, mainCol = 5
// ---------------------------------------------------------------------------

const L5G1 = build('5-1', 'CALCULATOARE', 5, [
  { word: 'SUCIT',  clue: 'Ciudat, răsucit, bizar',                row:  0, letterIdx: 2 },
  { word: 'PLASA',  clue: 'Rețea de prindere',                     row:  2, letterIdx: 2 },
  { word: 'SALON',  clue: 'Cameră elegantă de primire',            row:  4, letterIdx: 2 },
  { word: 'BUCLA',  clue: 'Inel de păr, spirală',                  row:  6, letterIdx: 2 },
  { word: 'SALUT',  clue: 'Formulă de salutare',                   row:  8, letterIdx: 3 },
  { word: 'TESLA',  clue: 'Unitate de măsură magnetică',           row: 10, letterIdx: 3 },
  { word: 'STARE',  clue: 'Condiție sau situație',                 row: 12, letterIdx: 2 },
  { word: 'ORBIT',  clue: 'Traiectorie a unui corp ceresc',        row: 14, letterIdx: 4 },
  { word: 'VAPOR',  clue: 'Navă cu aburi sau gaz',                 row: 16, letterIdx: 3 },
  { word: 'PASTA',  clue: 'Produs semisolid omogen',               row: 18, letterIdx: 4 },
  { word: 'ARBOR',  clue: 'Axă de rotație mecanică',               row: 20, letterIdx: 4 },
  { word: 'TARE',   clue: 'De o rezistență mare, solid',           row: 22, letterIdx: 3 },
], 5, 0);

const L5G2 = build('5-2', 'REVOLUTIONAR', 5, [
  { word: 'BARIL',  clue: 'Butoi mare pentru vin sau petrol',      row:  0, letterIdx: 2 },
  { word: 'BERE',   clue: 'Băutură alcoolică din hamei',           row:  2, letterIdx: 1 },
  { word: 'BIVOL',  clue: 'Animal domestic robust, bivolul',       row:  4, letterIdx: 2 },
  { word: 'CORT',   clue: 'Adăpost din pânză, cort de camping',   row:  6, letterIdx: 1 },
  { word: 'FLAUT',  clue: 'Instrument muzical de suflat',          row:  8, letterIdx: 1 },
  { word: 'TONUS',  clue: 'Energie vitală, stare de vigoare',      row: 10, letterIdx: 3 },
  { word: 'RETEA',  clue: 'Sistem de noduri interconectate',       row: 12, letterIdx: 2 },
  { word: 'TREZI',  clue: 'A ieși din somn, a te deștepta',       row: 14, letterIdx: 4 },
  { word: 'TABOU',  clue: 'Subiect sau faptă interzisă',          row: 16, letterIdx: 3 },
  { word: 'TANCA',  clue: 'Vehicul militar blindat cu șenile', row: 18, letterIdx: 2 },
  { word: 'SERIA',  clue: 'Succesiune ordonată de elemente',       row: 20, letterIdx: 4 },
  { word: 'TARA',   clue: 'Națiune sau stat suveran',              row: 22, letterIdx: 2 },
], 5, 1);

const L5G3 = build('5-3', 'EXTRAORDINAR', 5, [
  { word: 'TARE',   clue: 'Solid, rezistent, puternic',            row:  0, letterIdx: 3 },
  { word: 'MAXIM',  clue: 'Cel mai mare, limita superioară',       row:  2, letterIdx: 2 },
  { word: 'DEBUT',  clue: 'Prima apariție sau primă lansare',      row:  4, letterIdx: 4 },
  { word: 'FUGAR',  clue: 'Persoană care fuge, fugit',             row:  6, letterIdx: 4 },
  { word: 'DOINA',  clue: 'Cântec popular românesc liric',         row:  8, letterIdx: 4 },
  { word: 'BARON',  clue: 'Nobil de rang inferior',                row: 10, letterIdx: 3 },
  { word: 'SOLAR',  clue: 'Legat de Soare sau energie solară',     row: 12, letterIdx: 4 },
  { word: 'RAPID',  clue: 'Foarte rapid, iute',                    row: 14, letterIdx: 4 },
  { word: 'PARIS',  clue: 'Capitala Franței',                      row: 16, letterIdx: 3 },
  { word: 'CANOE',  clue: 'Ambarcațiune îngustă de paddling',      row: 18, letterIdx: 2 },
  { word: 'DOZA',   clue: 'Cantitate dintr-un medicament',         row: 20, letterIdx: 3 },
  { word: 'HUMOR',  clue: 'Simțul umorului, umor',                 row: 22, letterIdx: 4 },
], 5, 2);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const PUZZLES_BY_LEVEL: Record<number, IntramePuzzle[]> = {
  1: [L1G1, L1G2, L1G3],
  2: [L2G1, L2G2, L2G3],
  3: [L3G1, L3G2, L3G3],
  4: [L4G1, L4G2, L4G3],
  5: [L5G1, L5G2, L5G3],
};

export const LEVEL_NAMES: Record<number, string> = {
  1: 'Începător',
  2: 'Ușor',
  3: 'Mediu',
  4: 'Greu',
  5: 'Expert',
};

export const LEVEL_WORD_COUNTS: Record<number, number> = {
  1: 2,
  2: 5,
  3: 7,
  4: 9,
  5: 12,
};

export function getPuzzle(level: number, gameIndex: number): IntramePuzzle | null {
  return PUZZLES_BY_LEVEL[level]?.[gameIndex] ?? null;
}
