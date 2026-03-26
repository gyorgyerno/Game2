import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../prisma';

export interface AuthRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.isBanned) return res.status(403).json({ error: 'Contul tău a fost suspendat.' });
    req.userId = user.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
