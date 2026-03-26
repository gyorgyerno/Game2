const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.userGameStats.updateMany({
  where: { gameType: 'maze' },
  data: { gameType: 'labirinturi' },
}).then((r) => {
  console.log('Migrat:', r.count, 'inregistrari din maze -> labirinturi');
}).catch((e) => {
  console.error('Eroare:', e);
}).finally(() => {
  p.$disconnect();
});
