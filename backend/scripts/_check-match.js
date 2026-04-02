const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: [] });
const matchId = '673bf32b-2610-4f3b-adee-d95a81951d78';
(async () => {
  const match = await p.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: { select: { id: true, username: true, userType: true } } } } }
  });
  const botCfg = await p.botConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, enabled: true, maxBotsOnline: true } });
  const result = { match: match ? { id: match.id, status: match.status, gameType: match.gameType, level: match.level, players: match.players.map(p => ({ userId: p.userId, username: p.user.username, userType: p.user.userType })) } : null, botConfig: botCfg };
  fs.writeFileSync('./scripts/_match-info.json', JSON.stringify(result, null, 2), 'utf8');
})().finally(() => p.$disconnect());
