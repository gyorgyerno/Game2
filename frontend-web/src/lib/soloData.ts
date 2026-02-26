/**
 * Solo Integrame – puzzle data
 *
 * 5 nivele × 3 puzzle-uri = 15 puzzle-uri total
 *
 * Regulă geometrică: mainCol = 4 (coloana violet, 0-indexed)
 *   Fiecare cuvânt orizontal trebuie să conțină coloana 4.
 *   Litera din coloana 4 = secretWord[rândul cuvântului]
 *
 *   Toate cuvintele pornesc la col=2 și au 5 litere (acoperă col 2..6):
 *     litera secretă = word[mainCol - col] = word[4 - 2] = word[2]  (0-indexed)
 *
 * Verificare rapidă pentru fiecare puzzle:
 *   word.word[2] === secretWord[word.row]
 *
 * Vizual: 2 celule stânga coloana violet + violet + 2 celule dreapta
 *   → intersecție în mijlocul cuvântului, ca o integramă reală
 */

import type { CrosswordWord } from '@/components/game/CrosswordGrid';

export interface SoloPuzzle {
  id: string;
  title: string;
  secretWord: string;      // cuvântul dezvăluit de coloana violet
  secretClue: string;      // indiciu pentru cuvântul secret (afișat la final)
  rows: number;
  cols: number;
  mainCol: number;         // = 4 pentru toate puzzle-urile
  words: CrosswordWord[];  // DOAR cuvinte orizontale, col=2, 5 litere
}

export interface SoloLevel {
  level: number;
  label: string;
  description: string;
  color: string;
  puzzles: SoloPuzzle[];
}

// ---------------------------------------------------------------------------
// NIVEL 1 — 3 cuvinte orizontale (col=2, 5 litere), cuvânt secret de 3 litere
// Toate cuvintele: col=2, word[2] = litera secretă, acoperă coloanele 2..6
// ---------------------------------------------------------------------------

const L1P1: SoloPuzzle = {
  id: 'L1P1',
  title: 'Podul magic',
  secretWord: 'POD',
  secretClue: 'Construcție care traversează o apă sau o prăpastie',
  rows: 3,
  cols: 7,
  mainCol: 4,
  words: [
    // TAPIR col=2 → T,A,P,I,R  word[2]='P' = secret[0]='P' ✓
    { id: 1, word: 'TAPIR', clue: 'Mamifer exotic cu bot lung prensil, asemănător rinocerului', row: 0, col: 2, direction: 'horizontal' },
    // DRONA col=2 → D,R,O,N,A  word[2]='O' = secret[1]='O' ✓
    { id: 2, word: 'DRONA', clue: 'Aeronavă fără pilot, teleghidată; trântor – masculul albinei', row: 1, col: 2, direction: 'horizontal' },
    // RADAR col=2 → R,A,D,A,R  word[2]='D' = secret[2]='D' ✓
    { id: 3, word: 'RADAR', clue: 'Sistem electronic de detectare a obiectelor prin unde radio', row: 2, col: 2, direction: 'horizontal' },
  ],
};

const L1P2: SoloPuzzle = {
  id: 'L1P2',
  title: 'Calul de aur',
  secretWord: 'CAL',
  secretClue: 'Animal domestic folosit la călărie',
  rows: 3,
  cols: 7,
  mainCol: 4,
  words: [
    // VOCAL col=2 → V,O,C,A,L  word[2]='C' = secret[0]='C' ✓
    { id: 1, word: 'VOCAL', clue: 'Care ține de voce; exprimat verbal, cu glas tare', row: 0, col: 2, direction: 'horizontal' },
    // STARE col=2 → S,T,A,R,E  word[2]='A' = secret[1]='A' ✓
    { id: 2, word: 'STARE', clue: 'Situație, condiție, mod de a fi la un moment dat', row: 1, col: 2, direction: 'horizontal' },
    // SALON col=2 → S,A,L,O,N  word[2]='L' = secret[2]='L' ✓
    { id: 3, word: 'SALON', clue: 'Cameră mare de primire; atelier de coafură sau înfrumusețare', row: 2, col: 2, direction: 'horizontal' },
  ],
};

const L1P3: SoloPuzzle = {
  id: 'L1P3',
  title: 'Lacul albastru',
  secretWord: 'LAC',
  secretClue: 'Întindere de apă înconjurată de uscat',
  rows: 3,
  cols: 7,
  mainCol: 4,
  words: [
    // PALAT col=2 → P,A,L,A,T  word[2]='L' = secret[0]='L' ✓
    { id: 1, word: 'PALAT', clue: 'Clădire impunătoare; reședință regală sau oficială', row: 0, col: 2, direction: 'horizontal' },
    // DRAMA col=2 → D,R,A,M,A  word[2]='A' = secret[1]='A' ✓
    { id: 2, word: 'DRAMA', clue: 'Operă teatrală gravă; situație dificilă și emoționantă', row: 1, col: 2, direction: 'horizontal' },
    // ARCUL col=2 → A,R,C,U,L  word[2]='C' = secret[2]='C' ✓
    { id: 3, word: 'ARCUL', clue: 'Armă pentru tras cu săgeți; curbă geometrică (articulat)', row: 2, col: 2, direction: 'horizontal' },
  ],
};

// ---------------------------------------------------------------------------
// NIVEL 2 — 4 cuvinte orizontale (col=2, 5 litere), cuvânt secret de 4 litere
// ---------------------------------------------------------------------------

const L2P1: SoloPuzzle = {
  id: 'L2P1',
  title: 'Luna plină',
  secretWord: 'LUNA',
  secretClue: 'Satelitul natural al Pământului',
  rows: 4,
  cols: 7,
  mainCol: 4,
  words: [
    // VALUL col=2 → V,A,L,U,L  word[2]='L' = secret[0]='L' ✓
    { id: 1, word: 'VALUL', clue: 'Culmea apei în mișcare; tendință sau modă (articulat)', row: 0, col: 2, direction: 'horizontal' },
    // SCURT col=2 → S,C,U,R,T  word[2]='U' = secret[1]='U' ✓
    { id: 2, word: 'SCURT', clue: 'De lungime sau durata mică; concis, laconic', row: 1, col: 2, direction: 'horizontal' },
    // TANGO col=2 → T,A,N,G,O  word[2]='N' = secret[2]='N' ✓
    { id: 3, word: 'TANGO', clue: 'Dans de salon argentinian, sensual și ritmat', row: 2, col: 2, direction: 'horizontal' },
    // TRAPA col=2 → T,R,A,P,A  word[2]='A' = secret[3]='A' ✓
    { id: 4, word: 'TRAPA', clue: 'Ușă în podea sau în scena teatrului care se deschide brusc', row: 3, col: 2, direction: 'horizontal' },
  ],
};

const L2P2: SoloPuzzle = {
  id: 'L2P2',
  title: 'Vară tropicală',
  secretWord: 'VARA',
  secretClue: 'Anotimpul cel mai cald al anului',
  rows: 4,
  cols: 7,
  mainCol: 4,
  words: [
    // RIVAL col=2 → R,I,V,A,L  word[2]='V' = secret[0]='V' ✓
    { id: 1, word: 'RIVAL', clue: 'Persoană care concurează pentru același scop; adversar', row: 0, col: 2, direction: 'horizontal' },
    // BRAVO col=2 → B,R,A,V,O  word[2]='A' = secret[1]='A' ✓
    { id: 2, word: 'BRAVO', clue: 'Exclamație de entuziasm și aprobare; om curajos', row: 1, col: 2, direction: 'horizontal' },
    // CURSA col=2 → C,U,R,S,A  word[2]='R' = secret[2]='R' ✓
    { id: 3, word: 'CURSA', clue: 'Competiție sportivă de viteză; capcană ascunsă', row: 2, col: 2, direction: 'horizontal' },
    // STARE col=2 → S,T,A,R,E  word[2]='A' = secret[3]='A' ✓
    { id: 4, word: 'STARE', clue: 'Condiție sau situație la un moment dat; starea civilă', row: 3, col: 2, direction: 'horizontal' },
  ],
};

const L2P3: SoloPuzzle = {
  id: 'L2P3',
  title: 'Trenul verde',
  secretWord: 'TREN',
  secretClue: 'Vehicul feroviar tractat de locomotivă',
  rows: 4,
  cols: 7,
  mainCol: 4,
  words: [
    // BETON col=2 → B,E,T,O,N  word[2]='T' = secret[0]='T' ✓
    { id: 1, word: 'BETON', clue: 'Material de construcție din ciment, nisip și pietriș', row: 0, col: 2, direction: 'horizontal' },
    // BARZA col=2 → B,A,R,Z,A  word[2]='R' = secret[1]='R' ✓
    { id: 2, word: 'BARZA', clue: 'Pasăre migratoare albă, simbol al primăverii și al nașterii', row: 1, col: 2, direction: 'horizontal' },
    // STEMA col=2 → S,T,E,M,A  word[2]='E' = secret[2]='E' ✓
    { id: 3, word: 'STEMA', clue: 'Emblemă heraldică; simbolul oficial al unui stat sau familie', row: 2, col: 2, direction: 'horizontal' },
    // BANDA col=2 → B,A,N,D,A  word[2]='N' = secret[3]='N' ✓
    { id: 4, word: 'BANDA', clue: 'Grup de persoane; fâșie de material; trupă muzicală', row: 3, col: 2, direction: 'horizontal' },
  ],
};

// ---------------------------------------------------------------------------
// NIVEL 3 — 5 cuvinte orizontale (col=2, 5 litere), cuvânt secret de 5 litere
// ---------------------------------------------------------------------------

const L3P1: SoloPuzzle = {
  id: 'L3P1',
  title: 'Iarna albă',
  secretWord: 'IARNA',
  secretClue: 'Anotimpul cu zăpadă și ger',
  rows: 5,
  cols: 7,
  mainCol: 4,
  words: [
    // BRIZA col=2 → B,R,I,Z,A  word[2]='I' = secret[0]='I' ✓
    { id: 1, word: 'BRIZA', clue: 'Vânt ușor și răcoritor de pe mare sau câmpie', row: 0, col: 2, direction: 'horizontal' },
    // STARE col=2 → S,T,A,R,E  word[2]='A' = secret[1]='A' ✓
    { id: 2, word: 'STARE', clue: 'Condiție, situație la un moment dat', row: 1, col: 2, direction: 'horizontal' },
    // CURSA col=2 → C,U,R,S,A  word[2]='R' = secret[2]='R' ✓
    { id: 3, word: 'CURSA', clue: 'Competiție de viteză; capcană ascunsă', row: 2, col: 2, direction: 'horizontal' },
    // MANGA col=2 → M,A,N,G,A  word[2]='N' = secret[3]='N' ✓
    { id: 4, word: 'MANGA', clue: 'Benzi desenate japoneze; stil artistic cu personaje animate', row: 3, col: 2, direction: 'horizontal' },
    // DRAMA col=2 → D,R,A,M,A  word[2]='A' = secret[4]='A' ✓
    { id: 5, word: 'DRAMA', clue: 'Operă teatrală gravă; situație dificilă și emoționantă', row: 4, col: 2, direction: 'horizontal' },
  ],
};

const L3P2: SoloPuzzle = {
  id: 'L3P2',
  title: 'Muzeul de artă',
  secretWord: 'MUZEU',
  secretClue: 'Instituție culturală unde sunt expuse opere de artă',
  rows: 5,
  cols: 7,
  mainCol: 4,
  words: [
    // RUMBA col=2 → R,U,M,B,A  word[2]='M' = secret[0]='M' ✓
    { id: 1, word: 'RUMBA', clue: 'Dans originar din Cuba, cu ritm sincopat și mișcări cadențate', row: 0, col: 2, direction: 'horizontal' },
    // SCURT col=2 → S,C,U,R,T  word[2]='U' = secret[1]='U' ✓
    { id: 2, word: 'SCURT', clue: 'De lungime sau durată redusă; concis, succint', row: 1, col: 2, direction: 'horizontal' },
    // PIZZA col=2 → P,I,Z,Z,A  word[2]='Z' = secret[2]='Z' ✓
    { id: 3, word: 'PIZZA', clue: 'Preparat culinar italian cu blat rotund, sos de roșii și brânză', row: 2, col: 2, direction: 'horizontal' },
    // ARENE col=2 → A,R,E,N,E  word[2]='E' = secret[3]='E' ✓
    { id: 4, word: 'ARENE', clue: 'Spații de spectacole sau competiții, amfiteatre (plural)', row: 3, col: 2, direction: 'horizontal' },
    // SCUMP col=2 → S,C,U,M,P  word[2]='U' = secret[4]='U' ✓
    { id: 5, word: 'SCUMP', clue: 'De preț ridicat; prețios, drag, iubit (familiar)', row: 4, col: 2, direction: 'horizontal' },
  ],
};

const L3P3: SoloPuzzle = {
  id: 'L3P3',
  title: 'Culme verde',
  secretWord: 'CULME',
  secretClue: 'Punct cel mai înalt; apogeu, vârf',
  rows: 5,
  cols: 7,
  mainCol: 4,
  words: [
    // VOCAL col=2 → V,O,C,A,L  word[2]='C' = secret[0]='C' ✓
    { id: 1, word: 'VOCAL', clue: 'Care ține de voce; exprimat verbal cu glas tare', row: 0, col: 2, direction: 'horizontal' },
    // SCUMP col=2 → S,C,U,M,P  word[2]='U' = secret[1]='U' ✓
    { id: 2, word: 'SCUMP', clue: 'Cu valoare mare; prețuit, drag inimii', row: 1, col: 2, direction: 'horizontal' },
    // CALUL col=2 → C,A,L,U,L  word[2]='L' = secret[2]='L' ✓
    { id: 3, word: 'CALUL', clue: 'Animalul \'cal\' cu articol hotărât; pion de cavalerie la șah', row: 2, col: 2, direction: 'horizontal' },
    // CUMUL col=2 → C,U,M,U,L  word[2]='M' = secret[3]='M' ✓
    { id: 4, word: 'CUMUL', clue: 'Acumulare simultană de funcții sau drepturi', row: 3, col: 2, direction: 'horizontal' },
    // STEMA col=2 → S,T,E,M,A  word[2]='E' = secret[4]='E' ✓
    { id: 5, word: 'STEMA', clue: 'Emblema heraldică a unui stat, familie sau instituție', row: 4, col: 2, direction: 'horizontal' },
  ],
};

// ---------------------------------------------------------------------------
// NIVEL 4 — 6 cuvinte orizontale (col=2, 5 litere), cuvânt secret de 6 litere
// ---------------------------------------------------------------------------

const L4P1: SoloPuzzle = {
  id: 'L4P1',
  title: 'Toamnă colorată',
  secretWord: 'TOAMNA',
  secretClue: 'Anotimpul frunzelor colorate, dintre vară și iarnă',
  rows: 6,
  cols: 7,
  mainCol: 4,
  words: [
    // BETON col=2 → B,E,T,O,N  word[2]='T' = secret[0]='T' ✓
    { id: 1, word: 'BETON', clue: 'Material de construcție din ciment, nisip și pietriș', row: 0, col: 2, direction: 'horizontal' },
    // DRONA col=2 → D,R,O,N,A  word[2]='O' = secret[1]='O' ✓
    { id: 2, word: 'DRONA', clue: 'Aeronavă fără pilot teleghidată; trântor – masculul albinei', row: 1, col: 2, direction: 'horizontal' },
    // STARE col=2 → S,T,A,R,E  word[2]='A' = secret[2]='A' ✓
    { id: 3, word: 'STARE', clue: 'Situație, condiție, mod de a fi la un moment dat', row: 2, col: 2, direction: 'horizontal' },
    // CUMUL col=2 → C,U,M,U,L  word[2]='M' = secret[3]='M' ✓
    { id: 4, word: 'CUMUL', clue: 'Acumulare simultană de funcții sau drepturi; cumulul de sarcini', row: 3, col: 2, direction: 'horizontal' },
    // TANGO col=2 → T,A,N,G,O  word[2]='N' = secret[4]='N' ✓
    { id: 5, word: 'TANGO', clue: 'Dans de salon argentinian, sensual și ritmat', row: 4, col: 2, direction: 'horizontal' },
    // DRAMA col=2 → D,R,A,M,A  word[2]='A' = secret[5]='A' ✓
    { id: 6, word: 'DRAMA', clue: 'Piesă teatrală cu subiect grav; situație dificilă, tragică', row: 5, col: 2, direction: 'horizontal' },
  ],
};

const L4P2: SoloPuzzle = {
  id: 'L4P2',
  title: 'Zăpadă de iarnă',
  secretWord: 'ZAPADA',
  secretClue: 'Precipitații solide albe care acoperă pământul iarna',
  rows: 6,
  cols: 7,
  mainCol: 4,
  words: [
    // PIZZA col=2 → P,I,Z,Z,A  word[2]='Z' = secret[0]='Z' ✓
    { id: 1, word: 'PIZZA', clue: 'Preparat culinar italian cu blat rotund, sos de roșii și brânză', row: 0, col: 2, direction: 'horizontal' },
    // TRAPA col=2 → T,R,A,P,A  word[2]='A' = secret[1]='A' ✓
    { id: 2, word: 'TRAPA', clue: 'Ușă în podea sau în scena teatrului care se deschide brusc', row: 1, col: 2, direction: 'horizontal' },
    // TAPIR col=2 → T,A,P,I,R  word[2]='P' = secret[2]='P' ✓
    { id: 3, word: 'TAPIR', clue: 'Mamifer exotic cu bot lung prensil, rudă îndepărtată a rinocerului', row: 2, col: 2, direction: 'horizontal' },
    // BRAVO col=2 → B,R,A,V,O  word[2]='A' = secret[3]='A' ✓
    { id: 4, word: 'BRAVO', clue: 'Exclamație de entuziasm și aprobare; bărbat curajos', row: 3, col: 2, direction: 'horizontal' },
    // RADAR col=2 → R,A,D,A,R  word[2]='D' = secret[4]='D' ✓
    { id: 5, word: 'RADAR', clue: 'Sistem electronic de detectare a obiectelor prin unde radio', row: 4, col: 2, direction: 'horizontal' },
    // DRAMA col=2 → D,R,A,M,A  word[2]='A' = secret[5]='A' ✓
    { id: 6, word: 'DRAMA', clue: 'Operă teatrală cu subiect grav; situație critică', row: 5, col: 2, direction: 'horizontal' },
  ],
};

const L4P3: SoloPuzzle = {
  id: 'L4P3',
  title: 'Mașini și şosele',
  secretWord: 'MASINA',
  secretClue: 'Vehicul cu motor folosit pentru transport rutier',
  rows: 6,
  cols: 7,
  mainCol: 4,
  words: [
    // RUMBA col=2 → R,U,M,B,A  word[2]='M' = secret[0]='M' ✓
    { id: 1, word: 'RUMBA', clue: 'Dans originar din Cuba, cu mișcări cadențate și ritm sincopat', row: 0, col: 2, direction: 'horizontal' },
    // STARE col=2 → S,T,A,R,E  word[2]='A' = secret[1]='A' ✓
    { id: 2, word: 'STARE', clue: 'Situație, condiție sau mod de a fi la un moment dat', row: 1, col: 2, direction: 'horizontal' },
    // PASTA col=2 → P,A,S,T,A  word[2]='S' = secret[2]='S' ✓
    { id: 3, word: 'PASTA', clue: 'Aluat modelat; pastă de dinți; sos gros pentru paste', row: 2, col: 2, direction: 'horizontal' },
    // BRIZA col=2 → B,R,I,Z,A  word[2]='I' = secret[3]='I' ✓
    { id: 4, word: 'BRIZA', clue: 'Vânt ușor și răcoritor de pe mare sau câmpie', row: 3, col: 2, direction: 'horizontal' },
    // BANDA col=2 → B,A,N,D,A  word[2]='N' = secret[4]='N' ✓
    { id: 5, word: 'BANDA', clue: 'Grup de persoane; fâșie de material; trupă muzicală', row: 4, col: 2, direction: 'horizontal' },
    // TRAPA col=2 → T,R,A,P,A  word[2]='A' = secret[5]='A' ✓
    { id: 6, word: 'TRAPA', clue: 'Ușă în podea sau în scenă care se deschide brusc', row: 5, col: 2, direction: 'horizontal' },
  ],
};

// ---------------------------------------------------------------------------
// NIVEL 5 — 7 cuvinte orizontale (col=2, 5 litere), cuvânt secret de 7 litere
// ---------------------------------------------------------------------------

const L5P1: SoloPuzzle = {
  id: 'L5P1',
  title: 'Capitala lumii',
  secretWord: 'CAPITOL',
  secretClue: 'Clădire a legislativului; loc central al puterii unui stat',
  rows: 7,
  cols: 7,
  mainCol: 4,
  words: [
    // VOCAL col=2 → V,O,C,A,L  word[2]='C' = secret[0]='C' ✓
    { id: 1, word: 'VOCAL', clue: 'Care ține de voce; exprimat verbal și direct', row: 0, col: 2, direction: 'horizontal' },
    // DRAMA col=2 → D,R,A,M,A  word[2]='A' = secret[1]='A' ✓
    { id: 2, word: 'DRAMA', clue: 'Piesă teatrală gravă; situație dificilă și tensionată', row: 1, col: 2, direction: 'horizontal' },
    // CAPRA col=2 → C,A,P,R,A  word[2]='P' = secret[2]='P' ✓
    { id: 3, word: 'CAPRA', clue: 'Animal domestic rumegător cu coarne scurte, bun cățărător', row: 2, col: 2, direction: 'horizontal' },
    // BRIZA col=2 → B,R,I,Z,A  word[2]='I' = secret[3]='I' ✓
    { id: 4, word: 'BRIZA', clue: 'Vânt ușor și răcoritor de pe mare sau câmpie', row: 3, col: 2, direction: 'horizontal' },
    // BETON col=2 → B,E,T,O,N  word[2]='T' = secret[4]='T' ✓
    { id: 5, word: 'BETON', clue: 'Amestec de ciment, nisip și pietriș folosit în construcții', row: 4, col: 2, direction: 'horizontal' },
    // DRONA col=2 → D,R,O,N,A  word[2]='O' = secret[5]='O' ✓
    { id: 6, word: 'DRONA', clue: 'Aeronavă fără pilot, teleghidată de la distanță', row: 5, col: 2, direction: 'horizontal' },
    // SALON col=2 → S,A,L,O,N  word[2]='L' = secret[6]='L' ✓
    { id: 7, word: 'SALON', clue: 'Cameră mare de primire; atelier de coafură sau înfrumusețare', row: 6, col: 2, direction: 'horizontal' },
  ],
};

const L5P2: SoloPuzzle = {
  id: 'L5P2',
  title: 'Planeta albastră',
  secretWord: 'PLANETA',
  secretClue: 'Corp ceresc care orbitează în jurul unui Soare',
  rows: 7,
  cols: 7,
  mainCol: 4,
  words: [
    // TAPIR col=2 → T,A,P,I,R  word[2]='P' = secret[0]='P' ✓
    { id: 1, word: 'TAPIR', clue: 'Mamifer exotic cu bot lung prensil, trăiește în păduri tropicale', row: 0, col: 2, direction: 'horizontal' },
    // PALAT col=2 → P,A,L,A,T  word[2]='L' = secret[1]='L' ✓
    { id: 2, word: 'PALAT', clue: 'Clădire impunătoare; reședință regală sau oficială', row: 1, col: 2, direction: 'horizontal' },
    // STARE col=2 → S,T,A,R,E  word[2]='A' = secret[2]='A' ✓
    { id: 3, word: 'STARE', clue: 'Condiție sau situație la un moment dat; stare de spirit', row: 2, col: 2, direction: 'horizontal' },
    // MANGA col=2 → M,A,N,G,A  word[2]='N' = secret[3]='N' ✓
    { id: 4, word: 'MANGA', clue: 'Benzi desenate japoneze cu stil vizual distinctiv și animat', row: 3, col: 2, direction: 'horizontal' },
    // ARENE col=2 → A,R,E,N,E  word[2]='E' = secret[4]='E' ✓
    { id: 5, word: 'ARENE', clue: 'Spații de spectacole și competiții sportive; amfiteatre (plural)', row: 4, col: 2, direction: 'horizontal' },
    // BUTON col=2 → B,U,T,O,N  word[2]='T' = secret[5]='T' ✓
    { id: 6, word: 'BUTON', clue: 'Mic element de fixare pe haine; tastă sau comutator de pornire', row: 5, col: 2, direction: 'horizontal' },
    // BRAVO col=2 → B,R,A,V,O  word[2]='A' = secret[6]='A' ✓
    { id: 7, word: 'BRAVO', clue: 'Exclamație de entuziasm și aprobare; om curajos sau laudă', row: 6, col: 2, direction: 'horizontal' },
  ],
};

const L5P3: SoloPuzzle = {
  id: 'L5P3',
  title: 'Portretul maestrului',
  secretWord: 'PORTRET',
  secretClue: 'Reprezentare artistică a chipului unei persoane',
  rows: 7,
  cols: 7,
  mainCol: 4,
  words: [
    // CAPRA col=2 → C,A,P,R,A  word[2]='P' = secret[0]='P' ✓
    { id: 1, word: 'CAPRA', clue: 'Animal domestic cu coarne scurte, excelent cățărător pe stânci', row: 0, col: 2, direction: 'horizontal' },
    // PROBA col=2 → P,R,O,B,A  word[2]='O' = secret[1]='O' ✓
    { id: 2, word: 'PROBA', clue: 'Test sau verificare; probă sportivă; rodarea unui costum', row: 1, col: 2, direction: 'horizontal' },
    // BARZA col=2 → B,A,R,Z,A  word[2]='R' = secret[2]='R' ✓
    { id: 3, word: 'BARZA', clue: 'Pasăre migratoare albă cu aripi negre, simbol al primăverii', row: 2, col: 2, direction: 'horizontal' },
    // BETON col=2 → B,E,T,O,N  word[2]='T' = secret[3]='T' ✓
    { id: 4, word: 'BETON', clue: 'Material de construcție din ciment, nisip și pietriș', row: 3, col: 2, direction: 'horizontal' },
    // CURSA col=2 → C,U,R,S,A  word[2]='R' = secret[4]='R' ✓
    { id: 5, word: 'CURSA', clue: 'Competiție sportivă de viteză; capcană sau cursă ascunsă', row: 4, col: 2, direction: 'horizontal' },
    // STEMA col=2 → S,T,E,M,A  word[2]='E' = secret[5]='E' ✓
    { id: 6, word: 'STEMA', clue: 'Emblema heraldică a unui stat, familie sau instituție', row: 5, col: 2, direction: 'horizontal' },
    // MATCA col=2 → M,A,T,C,A  word[2]='T' = secret[6]='T' ✓
    { id: 7, word: 'MATCA', clue: 'Albia unui râu; stupul mamă; regina coloniei de albine', row: 6, col: 2, direction: 'horizontal' },
  ],
};

// ---------------------------------------------------------------------------
// EXPORT — toate nivelele
// ---------------------------------------------------------------------------

export const SOLO_LEVELS: SoloLevel[] = [
  {
    level: 1,
    label: 'Nivel 1',
    description: '3 cuvinte – Ușor',
    color: '#22c55e', // green-500
    puzzles: [L1P1, L1P2, L1P3],
  },
  {
    level: 2,
    label: 'Nivel 2',
    description: '4 cuvinte – Mediu',
    color: '#3b82f6', // blue-500
    puzzles: [L2P1, L2P2, L2P3],
  },
  {
    level: 3,
    label: 'Nivel 3',
    description: '5 cuvinte – Mediu-Greu',
    color: '#a855f7', // purple-500
    puzzles: [L3P1, L3P2, L3P3],
  },
  {
    level: 4,
    label: 'Nivel 4',
    description: '6 cuvinte – Greu',
    color: '#f97316', // orange-500
    puzzles: [L4P1, L4P2, L4P3],
  },
  {
    level: 5,
    label: 'Nivel 5',
    description: '7 cuvinte – Expert',
    color: '#ef4444', // red-500
    puzzles: [L5P1, L5P2, L5P3],
  },
];

/** Obține un puzzle după id (ex: "L2P3") */
export function getPuzzleById(id: string): SoloPuzzle | undefined {
  for (const lvl of SOLO_LEVELS) {
    const found = lvl.puzzles.find((p) => p.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Obține nivelul (1-5) al unui puzzle după id */
export function getLevelForPuzzle(id: string): number {
  for (const lvl of SOLO_LEVELS) {
    if (lvl.puzzles.some((p) => p.id === id)) return lvl.level;
  }
  return 1;
}

/** Obține puzzle-ul următor (sau null dacă e ultimul) */
export function getNextPuzzle(currentId: string): SoloPuzzle | null {
  const allPuzzles = SOLO_LEVELS.flatMap((l) => l.puzzles);
  const idx = allPuzzles.findIndex((p) => p.id === currentId);
  return idx >= 0 && idx < allPuzzles.length - 1 ? allPuzzles[idx + 1] : null;
}
