import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { isUserOnline } from '../socket';

const router = Router();

// ─── POST /api/friends/request  (trimite cerere după username) ─────────────────
router.post('/request', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const { username } = (req as import('express').Request).body as { username: string };
  if (!username) return res.status(400).json({ error: 'Username lipsă' });

  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return res.status(404).json({ error: 'Utilizatorul nu există' });
  if (target.id === req.userId) return res.status(400).json({ error: 'Nu poți adăuga tu însuți' });

  // Verifică dacă există deja o prietenie în oricare direcție
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: req.userId!, receiverId: target.id },
        { senderId: target.id, receiverId: req.userId! },
      ],
    },
  });
  if (existing) {
    if (existing.status === 'accepted') return res.status(400).json({ error: 'Sunteți deja prieteni' });
    if (existing.status === 'pending') return res.status(400).json({ error: 'Cerere deja trimisă' });
  }

  const friendship = await prisma.friendship.create({
    data: { senderId: req.userId!, receiverId: target.id },
    include: { receiver: { select: { id: true, username: true, avatarUrl: true } } },
  });
  return res.status(201).json(friendship);
});

// ─── GET /api/friends/online?gameType=&level=  (prieteni online filtrați pe nivel) ──
router.get('/online', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const { gameType, level } = (req as import('express').Request).query as { gameType?: string; level?: string };
  const levelNum = level ? parseInt(level, 10) : null;

  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ senderId: req.userId! }, { receiverId: req.userId! }],
    },
    select: { senderId: true, receiverId: true },
  });

  const friendIds = friendships.map((f) => f.senderId === req.userId ? f.receiverId : f.senderId);

  // Filtrează doar prietenii online
  const onlineIds = friendIds.filter((id) => isUserOnline(id));
  if (onlineIds.length === 0) return res.json([]);

  // Dacă gameType + level sunt specificate, verificăm că prietenul a jucat la acel nivel
  let eligibleIds = onlineIds;
  if (gameType && levelNum !== null && !isNaN(levelNum)) {
    const [statsMatches, soloMatches] = await Promise.all([
      prisma.userGameStats.findMany({
        where: { userId: { in: onlineIds }, gameType, level: { gte: levelNum } },
        select: { userId: true },
      }),
      prisma.userSoloGameProgress.findMany({
        where: { userId: { in: onlineIds }, gameType, level: { gte: levelNum } },
        select: { userId: true },
      }),
    ]);
    const eligibleSet = new Set([
      ...statsMatches.map((s) => s.userId),
      ...soloMatches.map((s) => s.userId),
    ]);
    // Level 1 — toată lumea poate juca (nivelul de bază)
    eligibleIds = levelNum <= 1 ? onlineIds : onlineIds.filter((id) => eligibleSet.has(id));
  }

  if (eligibleIds.length === 0) return res.json([]);

  const users = await prisma.user.findMany({
    where: { id: { in: eligibleIds } },
    select: { id: true, username: true, avatarUrl: true },
  });

  return res.json(users.map((u) => ({ ...u, isOnline: true })));
});

// ─── GET /api/friends  (lista prietenilor acceptați) ──────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: req.userId!, status: 'accepted' },
        { receiverId: req.userId!, status: 'accepted' },
      ],
    },
    include: {
      sender:   { select: { id: true, username: true, avatarUrl: true, rating: true, league: true } },
      receiver: { select: { id: true, username: true, avatarUrl: true, rating: true, league: true } },
    },
  });

  // Returnează celălalt user din fiecare prietenie
  const friends = friendships.map((f: any) => {
    const friend = f.senderId === req.userId ? f.receiver : f.sender;
    return { ...friend, isOnline: isUserOnline(friend.id) };
  });
  return res.json(friends);
});

// ─── GET /api/friends/requests  (cereri primite, pending) ─────────────────────
router.get('/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  const requests = await prisma.friendship.findMany({
    where: { receiverId: req.userId!, status: 'pending' },
    include: { sender: { select: { id: true, username: true, avatarUrl: true, rating: true, league: true } } },
  });
  return res.json(requests);
});

// ─── GET /api/friends/sent  (cereri trimise, pending) ─────────────────────────
router.get('/sent', requireAuth, async (req: AuthRequest, res: Response) => {
  const sent = await prisma.friendship.findMany({
    where: { senderId: req.userId!, status: 'pending' },
    include: { receiver: { select: { id: true, username: true, avatarUrl: true, rating: true, league: true } } },
  });
  return res.json(sent);
});

// ─── POST /api/friends/:id/accept ─────────────────────────────────────────────
router.post('/:id/accept', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const { id } = (req as import('express').Request).params;
  const f = await prisma.friendship.findUnique({ where: { id } });
  if (!f || f.receiverId !== req.userId) return res.status(403).json({ error: 'Nepermis' });

  const updated = await prisma.friendship.update({
    where: { id },
    data: { status: 'accepted' },
    include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
  });
  return res.json(updated);
});

// ─── DELETE /api/friends/:id  (refuză sau șterge) ────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest & import('express').Request, res: Response) => {
  const { id } = (req as import('express').Request).params;
  const f = await prisma.friendship.findUnique({ where: { id } });
  if (!f || (f.senderId !== req.userId && f.receiverId !== req.userId)) {
    return res.status(403).json({ error: 'Nepermis' });
  }
  await prisma.friendship.delete({ where: { id } });
  return res.json({ ok: true });
});

export default router;
