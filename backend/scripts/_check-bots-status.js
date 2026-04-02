const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: [] });
(async () => {
  const bots = await p.user.findMany({
    where: { userType: 'SIMULATED' },
    include: { aiProfile: { select: { skillLevel: true, enabled: true, preferredGames: true, onlineProbability: true } } },
    select: { id: true, username: true, userType: true, aiProfile: true }
  });
  const botConfig = await p.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });
  const waitingBots = await p.matchPlayer.count({
    where: { user: { userType: { in: ['SIMULATED', 'GHOST'] } }, match: { status: 'waiting' } }
  });
  const result = { botConfig: { id: botConfig?.id, enabled: botConfig?.enabled, maxBotsOnline: botConfig?.maxBotsOnline }, waitingBots, bots: bots.map(b => ({ username: b.username, enabled: b.aiProfile?.enabled, skillLevel: b.aiProfile?.skillLevel, preferredGames: b.aiProfile?.preferredGames })) };
  fs.writeFileSync('./scripts/_bots-status.json', JSON.stringify(result, null, 2), 'utf8');
})().finally(() => p.$disconnect());
