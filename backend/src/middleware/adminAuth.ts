import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AdminRequest extends Request {
  adminId?: string;
  adminUsername?: string;
}

export function adminAuth(req: AdminRequest, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token lipsa' });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), config.jwtSecret) as {
      adminId: string;
      username: string;
      role: string;
    };
    if (payload.role !== 'admin') {
      res.status(403).json({ error: 'Acces interzis' });
      return;
    }
    req.adminId = payload.adminId;
    req.adminUsername = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid sau expirat' });
  }
}
