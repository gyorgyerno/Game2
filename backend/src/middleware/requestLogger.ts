import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

/**
 * HTTP request/response logger middleware.
 * Logs: method, path, status, duration, IP, body size.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const { statusCode } = res;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${method} ${originalUrl} → ${statusCode}`, {
      ms,
      ip: ip || req.socket?.remoteAddress,
      resSize: res.get('content-length') ?? '-',
    });
  });

  next();
}
