import { createHash } from 'crypto';

/**
 * Deterministic SHA-256 hash for email lookup (UNIQUE index).
 * Always lowercase + trimmed before hashing.
 */
export function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex');
}

/**
 * Returns a masked version safe for admin display.
 * `mario@gmail.com` → `m***@gmail.com`
 * `ab@x.com`        → `a***@x.com`
 */
export function maskEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  const at = normalized.indexOf('@');
  if (at < 0) return '***';
  const local = normalized.substring(0, at);
  const domain = normalized.substring(at);
  const prefix = local.length > 0 ? local[0] : '*';
  return `${prefix}***${domain}`;
}

/**
 * Returns true if a string looks like a complete email address.
 * Used to decide whether to do an exact hash-lookup vs. partial display search.
 */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
