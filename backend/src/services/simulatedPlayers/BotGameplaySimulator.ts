import { Server as SocketServer } from 'socket.io';
import prisma from '../../prisma';
import logger from '../../logger';
import { SOCKET_EVENTS } from '@integrame/shared';
import { gameRegistry } from '../../games/GameRegistry';

// Simulează gameplay-ul botilor (SIMULATED + GHOST) într-un meci activ.
// Botii nu au conexiune socket reală, deci progresul lor e emis direct
// de server prin io.to(room) — apare pe frontul tuturor jucătorilor.

type BotSimParams = {
  io: SocketServer;
  matchId: string;
  room: string;
  gameType: string;
  level: number;
  timeLimit: number; // secunde
};

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Rezolvă parametrii de gameplay ai unui bot bazat pe skillLevel și gameType
function resolveBotGamePlan(
  skillLevel: number,
  gameType: string,
  level: number,
  timeLimit: number,
) {
  const isMaze = gameType === 'maze' || gameType === 'labirinturi';

  // Pași/răspunsuri corecte finale (bazat pe skill + nivel dificultate)
  const baseSteps = isMaze
    ? 20 + skillLevel * 4 + level * 3   // maze 9x9: ~60 celule active
    : 10 + skillLevel * 3 + level * 2;  // integrame

  const finalSteps = randomInt(
    Math.floor(baseSteps * 0.55),
    Math.min(Math.floor(baseSteps * 1.1), 120),
  );

  // Greșeli — invers proporțional cu skillLevel
  const mistakeRate = Math.max(0, 0.28 - skillLevel * 0.025);
  const finalMistakes = Math.floor(finalSteps * mistakeRate * randomBetween(0.7, 1.3));

  // Probabilitate de a termina meciul (a ajunge la finish)
  const finishProbability = isMaze
    ? Math.min(0.9, 0.15 + skillLevel * 0.08)   // skill 1: 23%, skill 10: 95%
    : Math.min(0.85, 0.2 + skillLevel * 0.07);   // integrame puțin mai greu

  const willFinish = Math.random() < finishProbability;

  // Momentul de finish (între 30% și 90% din timeLimit)
  const finishTimeSec = willFinish
    ? randomBetween(timeLimit * 0.3, timeLimit * 0.88)
    : timeLimit;

  // Interval între update-uri de progress (mai repede la skill mare)
  const progressIntervalMs = randomInt(
    Math.max(800, 2800 - skillLevel * 200),
    Math.max(1500, 4200 - skillLevel * 250),
  );

  return { finalSteps, finalMistakes, willFinish, finishTimeSec, progressIntervalMs };
}

// Pornește simularea pentru un singur bot
async function simulateSingleBot(
  io: SocketServer,
  matchId: string,
  room: string,
  botUserId: string,
  gameType: string,
  level: number,
  skillLevel: number,
  timeLimit: number,
) {
  const plan = resolveBotGamePlan(skillLevel, gameType, level, timeLimit);

  const startedAt = Date.now();
  let currentSteps = 0;
  let currentMistakes = 0;

  logger.debug('[BotGameplaySimulator] start', {
    matchId,
    botUserId,
    skillLevel,
    plan: {
      finalSteps: plan.finalSteps,
      finalMistakes: plan.finalMistakes,
      willFinish: plan.willFinish,
      finishTimeSec: plan.finishTimeSec.toFixed(1),
    },
  });

  while (true) {
    await sleep(plan.progressIntervalMs + randomInt(-200, 300));

    // Verifică dacă meciul mai e activ
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true, startedAt: true },
    });
    if (!match || match.status !== 'active') return;

    const elapsedSec = (Date.now() - startedAt) / 1000;

    // A ajuns la momentul de finish?
    const shouldFinish = plan.willFinish && elapsedSec >= plan.finishTimeSec;

    // Calculează progresul curent proporțional cu timpul scurs
    const progressRatio = Math.min(1, elapsedSec / plan.finishTimeSec);
    currentSteps = shouldFinish
      ? plan.finalSteps
      : Math.floor(plan.finalSteps * progressRatio * randomBetween(0.85, 1.05));
    currentMistakes = Math.floor(plan.finalMistakes * progressRatio);

    if (shouldFinish) {
      // Bot a terminat
      const isFirst = false; // jucătorul real de obicei e primul
      const finalScore = gameRegistry.calculateFinalScore(
        gameType,
        currentSteps,
        currentMistakes,
        isFirst,
      );

      await prisma.matchPlayer.updateMany({
        where: { matchId, userId: botUserId },
        data: {
          score: finalScore,
          correctAnswers: currentSteps,
          mistakes: currentMistakes,
          finishedAt: new Date(),
          isFirstFinisher: false,
        },
      });

      const updated = await prisma.match.findUnique({
        where: { id: matchId },
        include: { players: { include: { user: true } } },
      });

      io.to(room).emit(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, {
        userId: botUserId,
        correctAnswers: currentSteps,
        mistakes: currentMistakes,
        metrics: {},
        liveScore: finalScore,
        finished: true,
        players: updated?.players,
      });

      logger.debug('[BotGameplaySimulator] bot finished', {
        matchId, botUserId, finalScore, steps: currentSteps, mistakes: currentMistakes,
      });
      return;
    }

    // Progress intermediar
    const liveScore = gameRegistry.calculateLiveScore(gameType, currentSteps, currentMistakes);

    await prisma.matchPlayer.updateMany({
      where: { matchId, userId: botUserId },
      data: { score: liveScore, correctAnswers: currentSteps, mistakes: currentMistakes },
    });

    const updated = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: { include: { user: true } } },
    });

    io.to(room).emit(SOCKET_EVENTS.MATCH_PROGRESS_UPDATE, {
      userId: botUserId,
      correctAnswers: currentSteps,
      mistakes: currentMistakes,
      metrics: {},
      liveScore,
      finished: false,
      players: updated?.players,
    });

    // Dacă a trecut timeLimit, oprește
    if (elapsedSec >= timeLimit) return;
  }
}

// Entry point — apelat din matchHandler când meciul devine 'active'
export async function startBotGameplaySimulation(params: BotSimParams): Promise<void> {
  const { io, matchId, room, gameType, level, timeLimit } = params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: { include: { user: { include: { aiProfile: true } } } } },
  });

  if (!match) return;

  const botPlayers = match.players.filter(
    (p) => p.user.userType === 'SIMULATED' || p.user.userType === 'GHOST',
  );

  if (botPlayers.length === 0) return;

  for (const botPlayer of botPlayers) {
    const skillLevel = botPlayer.user.aiProfile?.skillLevel ?? 5;

    // Rulează simularea în background (fără await) — nu blochează meciul
    simulateSingleBot(io, matchId, room, botPlayer.userId, gameType, level, skillLevel, timeLimit)
      .catch((err) => logger.error('[BotGameplaySimulator] error', { matchId, botUserId: botPlayer.userId, err }));
  }
}
