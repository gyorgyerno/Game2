// Usage: node scripts/set-premium.js <email>
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const email = process.argv[2];
if (!email) { console.error('Usage: node scripts/set-premium.js <email>'); process.exit(1); }

prisma.user.update({ where: { email }, data: { plan: 'premium' } })
  .then(u => console.log(`✅ ${u.username} (${u.email}) -> plan: premium`))
  .catch(e => console.error('❌', e.message))
  .finally(() => prisma.$disconnect());
