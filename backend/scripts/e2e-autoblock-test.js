const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const BASE = 'http://localhost:4000';
const API = `${BASE}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenFor(userId) {
  return jwt.sign({ userId }, JWT_SECRET);
}

async function apiPost(pathname, token, body) {
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`${pathname} -> ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }

  return data;
}

async function runOneAbandonRound(userA, userB) {
  const tA = tokenFor(userA.id);
  const tB = tokenFor(userB.id);

  const m1 = await apiPost('/matches/find-or-create', tA, { gameType: 'integrame', level: 1, isAI: false });
  const m2 = await apiPost('/matches/find-or-create', tB, { gameType: 'integrame', level: 1, isAI: false });
  const matchId = m1?.id || m2?.id;

  if (!matchId) {
    throw new Error('No matchId generated');
  }

  const sA = io(BASE, { transports: ['websocket'], auth: { token: tA } });
  const sB = io(BASE, { transports: ['websocket'], auth: { token: tB } });

  await new Promise((resolve, reject) => {
    let connected = 0;
    const timeout = setTimeout(() => reject(new Error('Socket connect timeout')), 8000);

    const onConnected = () => {
      connected += 1;
      if (connected === 2) {
        clearTimeout(timeout);
        resolve();
      }
    };

    sA.on('connect', onConnected);
    sB.on('connect', onConnected);
    sA.on('connect_error', (e) => reject(new Error(`A connect_error: ${e.message}`)));
    sB.on('connect_error', (e) => reject(new Error(`B connect_error: ${e.message}`)));
  });

  sA.emit('join_match', { matchId });
  sB.emit('join_match', { matchId });

  // Wait until match transitions out of waiting so disconnect is treated as forfeit.
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Match did not start countdown/active in time')), 8000);
    const onState = (m) => {
      if (m && (m.status === 'countdown' || m.status === 'active')) {
        clearTimeout(timeout);
        sA.off('match_state', onState);
        sB.off('match_state', onState);
        resolve();
      }
    };
    const onCountdown = () => {
      clearTimeout(timeout);
      sA.off('match_state', onState);
      sB.off('match_state', onState);
      sA.off('match_countdown', onCountdown);
      sB.off('match_countdown', onCountdown);
      resolve();
    };
    sA.on('match_state', onState);
    sB.on('match_state', onState);
    sA.on('match_countdown', onCountdown);
    sB.on('match_countdown', onCountdown);
  });

  await sleep(1200);
  sA.disconnect();

  await sleep(4500);
  sB.disconnect();

  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true, finishedAt: true } });
  return { matchId, status: match?.status ?? null, finishedAt: match?.finishedAt ?? null };
}

async function main() {
  const stamp = Date.now();
  const emailA = `autoblock.a.${stamp}@test.local`;
  const emailB = `autoblock.b.${stamp}@test.local`;

  const prevAbandonRow = await prisma.systemConfig.findUnique({ where: { key: 'abandon' } });

  const testCfg = {
    enabled: true,
    enabledGameTypes: ['integrame'],
    penaltiesPerLevel: [
      { level: 1, xpPenaltySolo: -10, xpPenaltyMulti: -25 },
      { level: 2, xpPenaltySolo: -15, xpPenaltyMulti: -35 },
      { level: 3, xpPenaltySolo: -20, xpPenaltyMulti: -50 },
      { level: 4, xpPenaltySolo: -25, xpPenaltyMulti: -65 },
      { level: 5, xpPenaltySolo: -30, xpPenaltyMulti: -80 },
    ],
    autoBlockThreshold: 2,
    autoBlockEnabled: true,
  };

  let userA = null;
  let userB = null;

  try {
    await prisma.systemConfig.upsert({
      where: { key: 'abandon' },
      create: { key: 'abandon', value: JSON.stringify(testCfg), updatedBy: 'e2e-test' },
      update: { value: JSON.stringify(testCfg), updatedBy: 'e2e-test' },
    });

    userA = await prisma.user.create({
      data: {
        email: emailA,
        username: `autoA_${stamp}`,
        userType: 'REAL',
        rating: 1000,
        xp: 200,
        league: 'bronze',
        isBanned: false,
      },
    });

    userB = await prisma.user.create({
      data: {
        email: emailB,
        username: `autoB_${stamp}`,
        userType: 'REAL',
        rating: 1000,
        xp: 200,
        league: 'bronze',
        isBanned: false,
      },
    });

    const round1 = await runOneAbandonRound(userA, userB);
    const stateAfter1 = await prisma.user.findUnique({ where: { id: userA.id }, select: { isBanned: true, xp: true } });

    const round2 = await runOneAbandonRound(userA, userB);
    const stateAfter2 = await prisma.user.findUnique({ where: { id: userA.id }, select: { isBanned: true, xp: true } });

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const abandonCount = await prisma.match.count({
      where: {
        status: 'abandoned',
        gameType: 'integrame',
        finishedAt: { gte: since30 },
        players: { some: { userId: userA.id } },
      },
    });

    const logFile = path.join(process.cwd(), 'logs', `combined-${new Date().toISOString().slice(0, 10)}.log`);
    let logHit = null;
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).slice(-1200);
      logHit = lines.reverse().find((line) => line.includes('User auto-blocat dupa abandon excesiv') && line.includes(userA.id)) || null;
    }

    console.log(JSON.stringify({
      testUser: { id: userA.id, email: userA.email },
      rounds: [round1, round2],
      afterRound1: stateAfter1,
      afterRound2: stateAfter2,
      abandonCount30dIntegrame: abandonCount,
      autoBlockLogFound: Boolean(logHit),
      autoBlockLogLine: logHit,
    }, null, 2));
  } finally {
    if (userA || userB) {
      const ids = [userA?.id, userB?.id].filter(Boolean);
      await prisma.matchPlayer.deleteMany({ where: { userId: { in: ids } } });
      await prisma.userGameStats.deleteMany({ where: { userId: { in: ids } } });
      await prisma.playerSkillProfile.deleteMany({ where: { userId: { in: ids } } });
      await prisma.aIPlayerProfile.deleteMany({ where: { userId: { in: ids } } });
      await prisma.ghostRun.deleteMany({ where: { playerId: { in: ids } } });
      await prisma.bonusChallengeAward.deleteMany({ where: { userId: { in: ids } } });
      await prisma.contestPlayer.deleteMany({ where: { userId: { in: ids } } });
      await prisma.contestScore.deleteMany({ where: { userId: { in: ids } } });
      await prisma.friendship.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
      await prisma.invite.deleteMany({ where: { createdBy: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    if (prevAbandonRow) {
      await prisma.systemConfig.update({
        where: { key: 'abandon' },
        data: { value: prevAbandonRow.value, updatedBy: prevAbandonRow.updatedBy ?? 'restore-e2e' },
      });
    } else {
      await prisma.systemConfig.deleteMany({ where: { key: 'abandon' } });
    }
  }
}

main()
  .catch((err) => {
    console.error('E2E autoblock test failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
