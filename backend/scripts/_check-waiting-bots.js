const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const botsInWaiting = await prisma.matchPlayer.count({
    where: {
      user: { userType: { in: ['SIMULATED', 'GHOST'] } },
      match: { status: 'waiting' }
    }
  });
  const waitingMatches = await prisma.match.count({ where: { status: 'waiting' } });
  const abandonedMatches = await prisma.match.count({ where: { status: 'abandoned' } });
  const old = await prisma.match.findMany({
    where: { status: 'waiting' },
    select: { id: true, createdAt: true, gameType: true, level: true, players: { select: { user: { select: { userType: true, username: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: 20
  });
  const result = JSON.stringify({ botsInWaiting, waitingMatches, abandonedMatches, old }, null, 2);
  require('fs').writeFileSync(__dirname + '/_waiting-bots.json', result);
  console.log(result);
  await prisma.$disconnect();
}
main().catch(console.error);
