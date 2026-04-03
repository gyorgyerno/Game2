import path from 'path';
import fs from 'fs';
import { Router, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../prisma';
import { ratingToLeague } from '@integrame/shared';

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `avatar_${req.userId}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Doar imagini sunt acceptate'));
  },
});

const router = Router();

// GET /api/users/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { gameStats: true, gameRatings: true },
  });
  if (!user) return res.status(404).json({ error: 'Not found' });
  return res.json({ ...user, league: ratingToLeague(user.rating) });
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, username: true, avatarUrl: true,
      rating: true, xp: true, league: true, createdAt: true,
      gameStats: true, gameRatings: true,
    },
  });
  if (!user) return res.status(404).json({ error: 'Not found' });
  return res.json({ ...user, league: ratingToLeague(user.rating) });
});

// PATCH /api/users/me
router.patch('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const { username, avatarUrl } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { ...(username && { username }), ...(avatarUrl && { avatarUrl }) },
  });
  return res.json(user);
});

// POST /api/users/me/avatar  – upload imagine profil
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Niciun fișier trimis' });

  const backendUrl = process.env['BACKEND_URL'] || `http://localhost:${process.env['PORT'] || 4000}`;
  const avatarUrl = `${backendUrl}/uploads/${req.file.filename}`;

  // Delete old avatar file if it was one we uploaded
  const existing = await prisma.user.findUnique({ where: { id: req.userId }, select: { avatarUrl: true } });
  if (existing?.avatarUrl?.includes('/uploads/')) {
    const oldFile = path.join(UPLOADS_DIR, path.basename(existing.avatarUrl));
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { avatarUrl },
  });
  return res.json({ avatarUrl: user.avatarUrl });
});

export default router;
