const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name='friendships'")
  .then(r => { console.log('friendships table:', JSON.stringify(r)); return p.$disconnect(); });
