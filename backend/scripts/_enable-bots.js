const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ log: [] }); // disable query logging
(async () => {
  const current = await p.botConfig.findFirst({ orderBy: { createdAt: 'asc' } });
  console.error('CURRENT:', JSON.stringify({ id: current?.id, enabled: current?.enabled, maxBotsOnline: current?.maxBotsOnline }));
  if (current) {
    const updated = await p.botConfig.update({
      where: { id: current.id },
      data: { enabled: true }
    });
    console.error('UPDATED:', JSON.stringify({ id: updated.id, enabled: updated.enabled }));
  } else {
    const created = await p.botConfig.create({
      data: { id: 'default-bot-config', enabled: true, maxBotsOnline: 6, botScoreLimit: 5000, activityFeedEnabled: false, chatEnabled: false }
    });
    console.error('CREATED:', JSON.stringify({ id: created.id, enabled: created.enabled }));
  }
})().finally(() => p.$disconnect());
