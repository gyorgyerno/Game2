/**
 * Premium Private Rooms — REST API
 * Complet izolat, nu modifică nicio rută existentă.
 * gameType este String liber — funcționează cu orice joc din platformă.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { io } from '../socket';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function buildRoomPublic(roomId: string) {
  const room = await prisma.premiumRoom.findUnique({
    where: { id: roomId },
    include: {
      players: true,
      rounds: { orderBy: { order: 'asc' }, include: { scores: true } },
    },
  });
  if (!room) return null;

  // Obținem usernames în batch
  const userIds = room.players.map((p) => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const roundScores: Record<string, Array<{
    userId: string; username: string; score: number; timeTaken?: number; position?: number;
  }>> = {};
  for (const round of room.rounds) {
    roundScores[round.id] = round.scores.map((s) => ({
      userId: s.userId,
      username: s.username,
      score: s.score,
      timeTaken: s.timeTaken ?? undefined,
      position: s.position ?? undefined,
    }));
  }

  return {
    id: room.id,
    code: room.code,
    ownerId: room.ownerId,
    name: room.name ?? undefined,
    status: room.status,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    allowSpectators: room.allowSpectators,
    startAt: room.startAt?.toISOString(),
    startedAt: room.startedAt?.toISOString(),
    finishedAt: room.finishedAt?.toISOString(),
    createdAt: room.createdAt.toISOString(),
    players: room.players.map((p) => ({
      userId: p.userId,
      username: userMap[p.userId]?.username ?? 'Unknown',
      avatarUrl: userMap[p.userId]?.avatarUrl ?? undefined,
      isOwner: p.isOwner,
      isOnline: p.isOnline,
    })),
    rounds: room.rounds.map((r) => ({
      id: r.id,
      order: r.order,
      gameType: r.gameType,
      level: r.level,
      difficulty: r.difficulty,
      timeLimit: r.timeLimit,
      isActive: r.isActive,
      isFinished: r.isFinished,
    })),
    roundScores,
  };
}

function emitRoomUpdate(roomId: string) {
  buildRoomPublic(roomId).then((room) => {
    if (room) io.to(`premium_room:${roomId}`).emit('premium_room:update', { room });
  }).catch(() => {});
}

// ─── Schema de validare ───────────────────────────────────────────────────────

const RoundSchema = z.object({
  gameType: z.string().min(1),   // orice joc — game-agnostic
  level: z.number().int().min(1).max(10).default(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  timeLimit: z.number().int().min(30).max(3600).default(180),
});

const CreateRoomSchema = z.object({
  name: z.string().max(40).optional(),
  mode: z.enum(['quick', 'tournament']).default('quick'),
  maxPlayers: z.number().int().min(2).max(8).default(8),
  allowSpectators: z.boolean().default(false),
  startAt: z.string().datetime().optional(),
  rounds: z.array(RoundSchema).min(1).max(20),
});

// ─── POST /api/premium-rooms — creare cameră ─────────────────────────────────

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { plan: true } });
  if (!user || user.plan !== 'premium') {
    return res.status(403).json({ error: 'premium_required', message: 'Necesită plan Premium.' });
  }

  const parsed = CreateRoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, mode, maxPlayers, allowSpectators, startAt, rounds } = parsed.data;

  // Generăm un cod unic de 6 caractere
  let code = generateCode();
  let attempts = 0;
  while (await prisma.premiumRoom.findUnique({ where: { code } }) && attempts < 10) {
    code = generateCode();
    attempts++;
  }

  const room = await prisma.premiumRoom.create({
    data: {
      code,
      ownerId: req.userId!,
      name: name ?? null,
      mode,
      maxPlayers,
      allowSpectators,
      startAt: startAt ? new Date(startAt) : null,
      players: {
        create: { userId: req.userId!, isOwner: true, isOnline: true },
      },
      rounds: {
        create: rounds.map((r, i) => ({
          order: i + 1,
          gameType: r.gameType,
          level: r.level,
          difficulty: r.difficulty,
          timeLimit: r.timeLimit,
        })),
      },
    },
  });

  const roomPublic = await buildRoomPublic(room.id);
  return res.status(201).json(roomPublic);
});

// ─── GET /api/premium-rooms/my — camerele mele ───────────────────────────────

router.get('/my', requireAuth, async (req: AuthRequest, res: Response) => {
  const rooms = await prisma.premiumRoom.findMany({
    where: {
      players: { some: { userId: req.userId! } },
      status: { not: 'finished' },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      players: true,
      rounds: { orderBy: { order: 'asc' }, include: { scores: true } },
    },
  });

  const userIds = [...new Set(rooms.flatMap((r) => r.players.map((p) => p.userId)))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const result = rooms.map((room) => ({
    id: room.id,
    code: room.code,
    ownerId: room.ownerId,
    status: room.status,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    allowSpectators: room.allowSpectators,
    startAt: room.startAt?.toISOString(),
    createdAt: room.createdAt.toISOString(),
    players: room.players.map((p) => ({
      userId: p.userId,
      username: userMap[p.userId]?.username ?? 'Unknown',
      avatarUrl: userMap[p.userId]?.avatarUrl ?? undefined,
      isOwner: p.isOwner,
      isOnline: p.isOnline,
    })),
    rounds: room.rounds.map((r) => ({
      id: r.id,
      order: r.order,
      gameType: r.gameType,
      level: r.level,
      difficulty: r.difficulty,
      timeLimit: r.timeLimit,
      isActive: r.isActive,
      isFinished: r.isFinished,
    })),
    roundScores: {},
  }));

  return res.json(result);
});

// ─── GET /api/premium-rooms/:idOrCode — detalii cameră ───────────────────────

router.get('/:idOrCode', requireAuth, async (req: AuthRequest, res: Response) => {
  const { idOrCode } = req.params;
  const room = await prisma.premiumRoom.findFirst({
    where: { OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }] },
  });
  if (!room) return res.status(404).json({ error: 'Cameră negăsită.' });

  // verific că userul e player sau spectator permis
  const player = await prisma.premiumRoomPlayer.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: req.userId! } },
  });
  if (!player && !room.allowSpectators) {
    return res.status(403).json({ error: 'Nu ești în această cameră.' });
  }

  const roomPublic = await buildRoomPublic(room.id);
  return res.json(roomPublic);
});

// ─── POST /api/premium-rooms/join — intrare cu cod ───────────────────────────

router.post('/join', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({ code: z.string().min(4).max(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Cod invalid.' });

  const room = await prisma.premiumRoom.findUnique({
    where: { code: parsed.data.code.toUpperCase() },
    include: { players: true },
  });
  if (!room) return res.status(404).json({ error: 'Cameră negăsită.' });
  if (room.status === 'finished') return res.status(400).json({ error: 'Camera a fost finalizată.' });
  if (room.players.length >= room.maxPlayers) return res.status(400).json({ error: 'Camera este plină.' });

  // Dacă e deja înscris, întoarcem camera direct
  const existing = room.players.find((p) => p.userId === req.userId);
  if (!existing) {
    await prisma.premiumRoomPlayer.create({
      data: { roomId: room.id, userId: req.userId!, isOwner: false, isOnline: true },
    });
  }

  emitRoomUpdate(room.id);
  const roomPublic = await buildRoomPublic(room.id);
  return res.json(roomPublic);
});

// ─── PATCH /api/premium-rooms/:id/settings — actualizare setări (owner only) ─

router.patch('/:id/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  const room = await prisma.premiumRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: 'Cameră negăsită.' });
  if (room.ownerId !== req.userId) return res.status(403).json({ error: 'Doar owner-ul poate modifica setările.' });
  if (room.status !== 'lobby') return res.status(400).json({ error: 'Setările pot fi modificate doar în lobby.' });

  const schema = z.object({
    name: z.string().max(40).optional().nullable(),
    mode: z.enum(['quick', 'tournament']).optional(),
    maxPlayers: z.number().int().min(2).max(8).optional(),
    allowSpectators: z.boolean().optional(),
    startAt: z.string().datetime().nullable().optional(),
    rounds: z.array(RoundSchema).min(1).max(20).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rounds, startAt, ...rest } = parsed.data;

  await prisma.premiumRoom.update({
    where: { id: room.id },
    data: {
      ...rest,
      ...(startAt !== undefined ? { startAt: startAt ? new Date(startAt) : null } : {}),
    },
  });

  if (rounds) {
    // Înlocuim rundele — ștergem și recreăm (cascadă pe scoruri)
    await prisma.premiumRoomRound.deleteMany({ where: { roomId: room.id } });
    await prisma.premiumRoomRound.createMany({
      data: rounds.map((r, i) => ({
        roomId: room.id,
        order: i + 1,
        gameType: r.gameType,
        level: r.level,
        difficulty: r.difficulty,
        timeLimit: r.timeLimit,
      })),
    });
  }

  emitRoomUpdate(room.id);
  const roomPublic = await buildRoomPublic(room.id);
  return res.json(roomPublic);
});

// ─── POST /api/premium-rooms/:id/start — pornire cameră (owner only) ─────────

router.post('/:id/start', requireAuth, async (req: AuthRequest, res: Response) => {
  const room = await prisma.premiumRoom.findUnique({
    where: { id: req.params.id },
    include: { rounds: { orderBy: { order: 'asc' } }, players: true },
  });
  if (!room) return res.status(404).json({ error: 'Cameră negăsită.' });
  if (room.ownerId !== req.userId) return res.status(403).json({ error: 'Doar owner-ul poate porni.' });
  if (room.status !== 'lobby') return res.status(400).json({ error: 'Camera este deja pornită sau finalizată.' });
  if (room.players.length < 2) return res.status(400).json({ error: 'Sunt necesari cel puțin 2 jucători.' });
  if (room.rounds.length === 0) return res.status(400).json({ error: 'Nicio rundă configurată.' });

  const firstRound = room.rounds[0];
  await prisma.$transaction([
    prisma.premiumRoom.update({
      where: { id: room.id },
      data: { status: 'active', startedAt: new Date() },
    }),
    prisma.premiumRoomRound.update({
      where: { id: firstRound.id },
      data: { isActive: true },
    }),
  ]);

  emitRoomUpdate(room.id);
  io.to(`premium_room:${room.id}`).emit('premium_room:round_start', {
    roomId: room.id,
    round: { ...firstRound, isActive: true },
  });

  const roomPublic = await buildRoomPublic(room.id);
  return res.json(roomPublic);
});

// ─── POST /api/premium-rooms/:id/score — trimitere scor rundă ─────────────────

router.post('/:id/score', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    roundId: z.string(),
    score: z.number().int().min(0),
    timeTaken: z.number().int().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const room = await prisma.premiumRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: 'Cameră negăsită.' });

  // Verificăm că userul e în cameră
  const player = await prisma.premiumRoomPlayer.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: req.userId! } },
  });
  if (!player) return res.status(403).json({ error: 'Nu ești în această cameră.' });

  const round = await prisma.premiumRoomRound.findFirst({
    where: { id: parsed.data.roundId, roomId: room.id },
  });
  if (!round || !round.isActive) return res.status(400).json({ error: 'Runda nu este activă.' });

  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { username: true } });

  // Upsert — poate trimite scor o singură dată per rundă per jucător
  await prisma.premiumRoomScore.upsert({
    where: { roundId_userId: { roundId: round.id, userId: req.userId! } },
    create: {
      roundId: round.id,
      userId: req.userId!,
      username: user?.username ?? 'Unknown',
      score: parsed.data.score,
      timeTaken: parsed.data.timeTaken,
    },
    update: {
      score: parsed.data.score,
      timeTaken: parsed.data.timeTaken,
    },
  });

  // Verificăm dacă toți jucătorii au trimis scorul → avansăm automat
  const room2 = await prisma.premiumRoom.findUnique({
    where: { id: room.id },
    include: { players: true },
  });
  const scores = await prisma.premiumRoomScore.findMany({ where: { roundId: round.id } });

  if (room2 && scores.length >= room2.players.length) {
    // Calculăm poziții
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    await Promise.all(
      sorted.map((s, i) =>
        prisma.premiumRoomScore.update({
          where: { roundId_userId: { roundId: round.id, userId: s.userId } },
          data: { position: i + 1 },
        })
      )
    );

    await prisma.premiumRoomRound.update({ where: { id: round.id }, data: { isActive: false, isFinished: true } });

    io.to(`premium_room:${room.id}`).emit('premium_room:round_finish', {
      roomId: room.id,
      roundId: round.id,
      scores: sorted.map((s, i) => ({ userId: s.userId, username: s.username, score: s.score, timeTaken: s.timeTaken ?? undefined, position: i + 1 })),
    });

    // Verificăm dacă mai există runde
    const nextRound = await prisma.premiumRoomRound.findFirst({
      where: { roomId: room.id, isFinished: false, isActive: false },
      orderBy: { order: 'asc' },
    });

    if (nextRound) {
      await prisma.premiumRoomRound.update({ where: { id: nextRound.id }, data: { isActive: true } });
      io.to(`premium_room:${room.id}`).emit('premium_room:round_start', {
        roomId: room.id,
        round: { ...nextRound, isActive: true },
      });
    } else {
      // Toate rundele terminate → finalizăm camera
      await prisma.premiumRoom.update({ where: { id: room.id }, data: { status: 'finished', finishedAt: new Date() } });

      // Scor total per jucător
      const allScores = await prisma.premiumRoomScore.findMany({ where: { round: { roomId: room.id } } });
      const totals: Record<string, { userId: string; username: string; total: number }> = {};
      for (const s of allScores) {
        if (!totals[s.userId]) totals[s.userId] = { userId: s.userId, username: s.username, total: 0 };
        totals[s.userId].total += s.score;
      }
      const finalScores = Object.values(totals).sort((a, b) => b.total - a.total).map((t, i) => ({
        userId: t.userId, username: t.username, score: t.total, position: i + 1,
      }));

      io.to(`premium_room:${room.id}`).emit('premium_room:finish', { roomId: room.id, finalScores });
    }
  }

  emitRoomUpdate(room.id);
  return res.json({ ok: true });
});

// ─── POST /api/premium-rooms/:id/rematch — remeci cu aceleași setări ──────────

router.post('/:id/rematch', requireAuth, async (req: AuthRequest, res: Response) => {
  const oldRoom = await prisma.premiumRoom.findUnique({
    where: { id: req.params.id },
    include: { players: true, rounds: { orderBy: { order: 'asc' } } },
  });
  if (!oldRoom) return res.status(404).json({ error: 'Cameră negăsită.' });
  if (oldRoom.ownerId !== req.userId) return res.status(403).json({ error: 'Doar owner-ul poate iniția rematch.' });

  let code = generateCode();
  let attempts = 0;
  while (await prisma.premiumRoom.findUnique({ where: { code } }) && attempts < 10) {
    code = generateCode();
    attempts++;
  }

  const newRoom = await prisma.premiumRoom.create({
    data: {
      code,
      ownerId: oldRoom.ownerId,
      mode: oldRoom.mode,
      maxPlayers: oldRoom.maxPlayers,
      allowSpectators: oldRoom.allowSpectators,
      players: {
        create: oldRoom.players.map((p) => ({ userId: p.userId, isOwner: p.isOwner, isOnline: false })),
      },
      rounds: {
        create: oldRoom.rounds.map((r) => ({
          order: r.order,
          gameType: r.gameType,
          level: r.level,
          difficulty: r.difficulty,
          timeLimit: r.timeLimit,
        })),
      },
    },
  });

  io.to(`premium_room:${oldRoom.id}`).emit('premium_room:rematch', {
    roomId: oldRoom.id,
    newRoomId: newRoom.id,
    newCode: newRoom.code,
  });

  const roomPublic = await buildRoomPublic(newRoom.id);
  return res.json(roomPublic);
});

// ─── DELETE /api/premium-rooms/:id — leave room ───────────────────────────────

router.delete('/:id/leave', requireAuth, async (req: AuthRequest, res: Response) => {
  const room = await prisma.premiumRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: 'Cameră negăsită.' });

  await prisma.premiumRoomPlayer.deleteMany({
    where: { roomId: room.id, userId: req.userId! },
  });

  // Dacă owner-ul pleacă și camera e în lobby → transferăm ownership sau închidem
  if (room.ownerId === req.userId && room.status === 'lobby') {
    const remaining = await prisma.premiumRoomPlayer.findFirst({ where: { roomId: room.id } });
    if (remaining) {
      await prisma.premiumRoom.update({ where: { id: room.id }, data: { ownerId: remaining.userId } });
      await prisma.premiumRoomPlayer.update({ where: { id: remaining.id }, data: { isOwner: true } });
    } else {
      await prisma.premiumRoom.update({ where: { id: room.id }, data: { status: 'finished', finishedAt: new Date() } });
    }
  }

  emitRoomUpdate(room.id);
  return res.json({ ok: true });
});

// ─── POST /:id/invite/:friendId — trimite notificare socket unui prieten ──────
router.post('/:id/invite/:friendId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { id, friendId } = req.params;

  // Verifică că room-ul există și invitantul este în cameră
  const player = await prisma.premiumRoomPlayer.findFirst({
    where: { roomId: id, userId: req.userId! },
    include: { room: true },
  });
  if (!player) return res.status(403).json({ error: 'Nu ești în această cameră.' });
  if (player.room.status === 'finished') return res.status(400).json({ error: 'Camera este finalizată.' });

  // Verifică prietenia
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId: req.userId!, receiverId: friendId },
        { senderId: friendId, receiverId: req.userId! },
      ],
    },
  });
  if (!friendship) return res.status(403).json({ error: 'Nu ești prieten cu acest utilizator.' });

  // Obține datele pentru notificare
  const [inviter, room] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId! }, select: { username: true } }),
    buildRoomPublic(id),
  ]);

  // Emite pe socket-ul personal al prietenului (room `user:<id>`)
  io.to(`user:${friendId}`).emit('premium_room:invite', {
    roomId: id,
    code: player.room.code,
    inviterUsername: inviter?.username ?? '?',
    mode: player.room.mode,
    roomName: player.room.name ?? undefined,
  });

  return res.json({ ok: true });
});

export default router;
