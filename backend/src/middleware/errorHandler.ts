import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

/**
 * Global Express error handler – must be registered LAST, after all routes.
 * Catches any error passed via next(err) or thrown in async routes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const status = (err as unknown as Record<string, number>)['status'] ?? 500;

  logger.error(`${req.method} ${req.originalUrl} threw ${err.name}`, {
    status,
    message: err.message,
    stack: process.env['NODE_ENV'] !== 'production' ? err.stack : undefined,
    body: process.env['NODE_ENV'] !== 'production' ? req.body : undefined,
    params: req.params,
    query: req.query,
    userId: (req as unknown as Record<string, string>)['userId'],
  });

  if (res.headersSent) return;

  res.status(status).json({
    error: status < 500 ? err.message : 'Internal Server Error',
    ...(process.env['NODE_ENV'] !== 'production' && { detail: err.message, stack: err.stack }),
  });
}

/**
 * Wraps an async Express handler so errors are forwarded to globalErrorHandler
 * without needing try-catch in every route.
 *
 * Usage:  router.get('/foo', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
