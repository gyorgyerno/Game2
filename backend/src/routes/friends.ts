import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';

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
  const friends = friendships.map((f: any) =>
    f.senderId === req.userId ? f.receiver : f.sender
  );
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
