import { decryptEmail } from './encryption';

interface Entry {
  email: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, Entry>();

/**
 * Returns the decrypted email for a user, using an in-memory TTL cache.
 * Supply the encrypted value so we can decrypt on cache miss.
 */
export function getCachedEmail(userId: string, encryptedEmail: string): string {
  const now = Date.now();
  const entry = cache.get(userId);
  if (entry && entry.expiresAt > now) return entry.email;
  const email = decryptEmail(encryptedEmail);
  cache.set(userId, { email, expiresAt: now + TTL_MS });
  return email;
}

export function invalidateEmailCache(userId: string): void {
  cache.delete(userId);
}
