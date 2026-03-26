const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  // Verifică ce e în DB
  const sample = await prisma.user.findMany({
    where: { email: { contains: 'integrame.local' } },
    select: { id: true, username: true, email: true, userType: true },
    take: 5,
  });
  console.log('Sample boti:', JSON.stringify(sample, null, 2));

  // Actualizează prin email pattern
  const r1 = await prisma.user.updateMany({
    where: { email: { contains: 'integrame.local' } },
    data: { userType: 'SIMULATED' },
  });
  console.log('Actualizati dupa email:', r1.count);

  // Actualizează și cei cu aiProfile dar fără email integrame.local
  const botIds = await prisma.aIPlayerProfile.findMany({ select: { userId: true } });
  if (botIds.length > 0) {
    const r2 = await prisma.user.updateMany({
      where: { id: { in: botIds.map(b => b.userId) } },
      data: { userType: 'SIMULATED' },
    });
    console.log('Actualizati dupa aiProfile:', r2.count);
  }

  await prisma.$disconnect();
}

fix().catch(console.error);
