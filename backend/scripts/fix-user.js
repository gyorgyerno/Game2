const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WINS_TO_UNLOCK = 5;

async function main() {
  const u = await prisma.user.findFirst({ where: { email: 'erno_gyorgy@yahoo.co.uk' } });
  if (!u) { console.log('User negasit'); return; }
  console.log('ID:', u.id, '| Username:', u.username);

  // Afisam stats actuale
  const stats = await prisma.userGameStats.findMany({ where: { userId: u.id } });
  console.log('Stats actuale:');
  stats.forEach(s => console.log(`  gameType=${s.gameType} level=${s.level} wins=${s.wins} played=${s.matchesPlayed}`));

  // Stergem stats pentru nivel 2+
  const deleted = await prisma.userGameStats.deleteMany({
    where: { userId: u.id, level: { gte: 2 } }
  });
  console.log('Stats nivel 2+ sterse:', deleted.count);

  // Resetam wins la nivel 1 la 4 (sub pragul de 5)
  const updated = await prisma.userGameStats.updateMany({
    where: { userId: u.id, level: 1, wins: { gte: WINS_TO_UNLOCK } },
    data: { wins: WINS_TO_UNLOCK - 1 }
  });
  console.log('Stats nivel 1 resetate:', updated.count, '(wins set la', WINS_TO_UNLOCK - 1, ')');

  // Verified final
  const statsAfter = await prisma.userGameStats.findMany({ where: { userId: u.id } });
  console.log('Stats finale:');
  statsAfter.forEach(s => console.log(`  gameType=${s.gameType} level=${s.level} wins=${s.wins}`));
  console.log('Gata! Nivel 2 e acum blocat.');
}

main().catch(console.error).finally(() => process.exit(0));
