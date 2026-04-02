const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.botConfig.findFirst({ orderBy: { createdAt: 'asc' } })
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .finally(() => p.$disconnect());
