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

  // Simulated players (idempotent)
  const simulatedUsers = [
    { email: 'sim.puzzlefox@integrame.local', username: 'PuzzleFox', rating: 1480, xp: 900, league: 'gold' },
    { email: 'sim.andrei88@integrame.local', username: 'Andrei88', rating: 1360, xp: 760, league: 'silver' },
    { email: 'sim.brainstormer@integrame.local', username: 'BrainStormer', rating: 1620, xp: 1300, league: 'platinum' },
    { email: 'sim.maraplay@integrame.local', username: 'MaraPlay', rating: 1240, xp: 520, league: 'silver' },
    { email: 'sim.alexx@integrame.local', username: 'AlexX', rating: 1180, xp: 410, league: 'bronze' },
    { email: 'sim.mazehunter@integrame.local', username: 'MazeHunter', rating: 1710, xp: 1660, league: 'platinum' },
    { email: 'sim.wordmaster@integrame.local', username: 'WordMaster', rating: 1820, xp: 2100, league: 'diamond' },
    { email: 'sim.ionutplay@integrame.local', username: 'IonutPlay', rating: 1290, xp: 640, league: 'silver' },
    { email: 'sim.ralucagame@integrame.local', username: 'RalucaGame', rating: 1430, xp: 860, league: 'gold' },
    { email: 'sim.nexusmaze@integrame.local', username: 'NexusMaze', rating: 1560, xp: 1120, league: 'gold' },
  ];

  const aiPersonalities = ['FAST_RISKY', 'SLOW_THINKER', 'CASUAL_PLAYER', 'PERFECTIONIST', 'CHAOTIC_PLAYER'];

  for (let index = 0; index < simulatedUsers.length; index++) {
    const userSeed = simulatedUsers[index];
    const personality = aiPersonalities[index % aiPersonalities.length];
    const skillLevel = 3 + (index % 6); // 3..8

    const simulatedUser = await prisma.user.upsert({
      where: { email: userSeed.email },
      update: {
        username: userSeed.username,
        rating: userSeed.rating,
        xp: userSeed.xp,
        league: userSeed.league,
        userType: 'SIMULATED',
      },
      create: {
        ...userSeed,
        userType: 'SIMULATED',
      },
    });

    await prisma.aIPlayerProfile.upsert({
      where: { userId: simulatedUser.id },
      update: {
        skillLevel,
        personality,
        enabled: true,
      },
      create: {
        userId: simulatedUser.id,
        skillLevel,
        thinkingSpeedMsMin: Math.max(1200, 4600 - skillLevel * 320),
        thinkingSpeedMsMax: Math.max(2600, 7600 - skillLevel * 420),
        mistakeRate: Math.max(0.06, 0.24 - skillLevel * 0.02),
        hesitationProbability: Math.max(0.08, 0.28 - skillLevel * 0.02),
        correctionProbability: Math.min(0.6, 0.22 + skillLevel * 0.03),
        playStyle: personality.toLowerCase(),
        personality,
        preferredGames: JSON.stringify(index % 2 === 0 ? ['integrame', 'maze'] : ['maze', 'slogane']),
        onlineProbability: 0.25 + (index % 4) * 0.1,
        chatProbability: 0.03 + (index % 3) * 0.02,
        sessionLengthMin: 8,
        sessionLengthMax: 24,
        activityPattern: JSON.stringify({
          activeHours: [10, 11, 12, 17, 18, 19, 20, 21],
          timezone: 'Europe/Bucharest',
        }),
        enabled: true,
      },
    });
  }

  await prisma.botConfig.upsert({
    where: { id: 'default-bot-config' },
    update: {},
    create: {
      id: 'default-bot-config',
      enabled: false,
      maxBotsOnline: 6,
      botScoreLimit: 5000,
      activityFeedEnabled: false,
      chatEnabled: false,
    },
  });

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
