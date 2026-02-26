import path from 'path';
import fs from 'fs';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// ─── Log formats ──────────────────────────────────────────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta, null, 0) : '';
    return `[${timestamp}] ${level}: ${message}${extras}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ─── Transports ───────────────────────────────────────────────────────────────
const transports: winston.transport[] = [
  // Console – always on
  new winston.transports.Console({ format: consoleFormat }),

  // errors.log – only ERROR level, rotated daily, kept 30 days
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: fileFormat,
    maxFiles: '30d',
    maxSize: '10m',
    zippedArchive: true,
  }),

  // combined.log – all levels, rotated daily, kept 14 days
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: fileFormat,
    maxFiles: '14d',
    maxSize: '20m',
    zippedArchive: true,
  }),
];

// ─── Logger instance ──────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  transports,
});

// ─── Uncaught / unhandled promise fallback ────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('UncaughtException', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('UnhandledRejection', { reason: String(reason) });
});

export default logger;
