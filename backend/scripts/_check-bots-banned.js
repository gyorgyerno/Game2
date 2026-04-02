const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const all = await prisma.user.findMany({
    where: { userType: { in: ['SIMULATED', 'GHOST'] } },
    select: { id: true, username: true, userType: true, isBanned: true, aiProfile: { select: { enabled: true, skillLevel: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const banned = all.filter(u => u.isBanned);
  const result = {
    total: all.length,
    banned: banned.length,
    enabled: all.filter(u => u.aiProfile?.enabled).length,
    bannedUsers: banned,
    allUsers: all,
  };
  require('fs').writeFileSync(__dirname + '/_bots-banned.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}
main().catch(console.error);
