import { Router, Request, Response } from 'express';
import logger from '../logger';

const router = Router();

interface ClientLogPayload {
  type: string;       // 'axios-error' | 'react-boundary' | 'unhandled'
  method?: string;
  url?: string;
  status?: number;
  message: string;
  stack?: string;
  componentStack?: string;
  platform?: string;  // 'web' | 'mobile'
  ts?: string;
}

/**
 * POST /api/logs/client
 * Receives client-side (browser / mobile) error reports and writes them
 * to the backend log files via winston.
 * This route is intentionally unauthenticated so it works even on 401.
 */
router.post('/', (req: Request, res: Response) => {
  const body = req.body as ClientLogPayload;

  const level = (body.status ?? 0) >= 500 || !body.status ? 'error' : 'warn';

  logger[level](`[CLIENT] ${body.type} – ${body.message}`, {
    method: body.method,
    url: body.url,
    status: body.status,
    platform: body.platform ?? 'web',
    stack: body.stack,
    componentStack: body.componentStack,
    clientTs: body.ts,
    ip: req.ip,
  });

  res.status(204).end();
});

export default router;
