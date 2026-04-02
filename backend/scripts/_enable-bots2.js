const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: [] });
(async () => {
  const current = await p.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });
  const result = { current: current ? { id: current.id, enabled: current.enabled, maxBotsOnline: current.maxBotsOnline } : null };
  if (current && !current.enabled) {
    const updated = await p.botConfig.update({ where: { id: current.id }, data: { enabled: true } });
    result.updated = { id: updated.id, enabled: updated.enabled };
  } else if (current && current.enabled) {
    result.alreadyEnabled = true;
  }
  fs.writeFileSync('./scripts/_result.json', JSON.stringify(result, null, 2), 'utf8');
})().finally(() => p.$disconnect());
