const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany({ select: { id: true, email: true, username: true, plan: true } })
  .then(u => console.log(JSON.stringify(u, null, 2)))
  .finally(() => prisma.$disconnect());
