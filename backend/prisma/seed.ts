import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed GameTypes
  await prisma.gameType.upsert({
    where: { id: 'integrame' },
    update: {},
    create: {
      id: 'integrame',
      name: 'Integrame',
      description: 'Cuvinte încrucișate competitive multiplayer',
      isActive: true,
    },
  });

  await prisma.gameType.upsert({
    where: { id: 'slogane' },
    update: {},
    create: {
      id: 'slogane',
      name: 'Slogane',
      description: 'Ghicește sloganul brandului',
      isActive: true,
    },
  });

  await prisma.gameType.upsert({
    where: { id: 'maze' },
    update: {},
    create: {
      id: 'maze',
      name: 'Labirinturi',
      description: 'Navighează labirintul în modul multiplayer',
      isActive: true,
    },
  });

  // Demo users
  const demoUsers = [
    { email: 'alice@test.ro', username: 'Alice', rating: 1850, xp: 2400, league: 'diamond' },
    { email: 'bob@test.ro', username: 'BobRo', rating: 1720, xp: 1800, league: 'platinum' },
    { email: 'carol@test.ro', username: 'Carol', rating: 1540, xp: 1200, league: 'gold' },
    { email: 'dan@test.ro', username: 'DanVlad', rating: 1320, xp: 800, league: 'silver' },
    { email: 'ema@test.ro', username: 'EmaRo', rating: 1150, xp: 400, league: 'bronze' },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { rating: u.rating, xp: u.xp, league: u.league },
      create: u,
    });
  }

  // Seed Season
  await prisma.season.upsert({
    where: { id: 'season-1' },
    update: {},
    create: {
      id: 'season-1',
      name: 'Sezon 1 – Primăvara 2026',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-06-30'),
      isActive: true,
    },
  });

  console.log('✅ Seed completed');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
