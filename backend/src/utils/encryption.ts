import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;

function getKey(): Buffer {
  const hex = process.env.EMAIL_ENCRYPTION_KEY ?? '';
  if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('EMAIL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts email with AES-256-GCM.
 * Output format (base64): [16-byte IV][16-byte AuthTag][ciphertext]
 */
export function encryptEmail(email: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts an email previously encrypted with encryptEmail.
 */
export function decryptEmail(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('Invalid encrypted email format');
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
