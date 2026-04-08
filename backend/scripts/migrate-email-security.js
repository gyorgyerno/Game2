/**
 * migrate-email-security.js
 * ─────────────────────────
 * Phase 1 migration: back-fills email_encrypted, email_hash, email_display
 * for all existing User and OTP records that don't yet have these fields set.
 *
 * Usage:
 *   node scripts/migrate-email-security.js [--dry-run]
 *
 * Requirements:
 *   EMAIL_ENCRYPTION_KEY must be set in .env (64 hex chars = 32 bytes)
 *   Run: node -e "require('crypto').randomBytes(32).toString('hex') |>console.log"
 *     to generate a key.
 *
 * Safe to run multiple times (idempotent — skips rows that already have email_hash set).
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createCipheriv, createHash, randomBytes } = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 100;

// ─── Crypto helpers (inline — no TS imports in a JS script) ──────────────────

function getKey() {
  const hex = process.env.EMAIL_ENCRYPTION_KEY || '';
  if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error('[ERROR] EMAIL_ENCRYPTION_KEY must be set to a 64-character hex string.');
    console.error('  Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  return Buffer.from(hex, 'hex');
}

function encryptEmail(email) {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function hashEmail(email) {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function maskEmail(email) {
  const normalized = email.toLowerCase().trim();
  const at = normalized.indexOf('@');
  if (at < 0) return '***';
  const local = normalized.substring(0, at);
  const domain = normalized.substring(at);
  const prefix = local.length > 0 ? local[0] : '*';
  return `${prefix}***${domain}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function migrateUsers(prisma) {
  let skip = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;

  console.log('\n[Users] Starting...');

  while (true) {
    const batch = await prisma.user.findMany({
      where: { email_hash: null },
      select: { id: true, email: true },
      skip,
      take: BATCH,
      orderBy: { createdAt: 'asc' },
    });

    if (batch.length === 0) break;

    for (const user of batch) {
      if (!user.email || !user.email.includes('@')) {
        console.warn(`  [SKIP] User ${user.id}: invalid email format`);
        totalSkipped++;
        continue;
      }

      const email_hash = hashEmail(user.email);
      const email_display = maskEmail(user.email);
      let email_encrypted;
      try {
        email_encrypted = encryptEmail(user.email);
      } catch (err) {
        console.error(`  [ERROR] User ${user.id}: encryption failed — ${err.message}`);
        totalSkipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY] User ${user.id}: ${user.email} → ${email_display} (hash: ${email_hash.slice(0, 12)}...)`);
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { email_hash, email_display, email_encrypted },
        });
      }
      totalMigrated++;
    }

    console.log(`  Processed batch: ${batch.length} rows (migrated so far: ${totalMigrated})`);
    skip += BATCH;
  }

  return { totalMigrated, totalSkipped };
}

async function migrateOTPs(prisma) {
  let skip = 0;
  let totalMigrated = 0;

  console.log('\n[OTPs] Starting...');

  while (true) {
    const batch = await prisma.oTP.findMany({
      where: { email_hash: null },
      select: { id: true, email: true },
      skip,
      take: BATCH,
      orderBy: { createdAt: 'asc' },
    });

    if (batch.length === 0) break;

    for (const otp of batch) {
      if (!otp.email || !otp.email.includes('@')) continue;
      const email_hash = hashEmail(otp.email);

      if (DRY_RUN) {
        console.log(`  [DRY] OTP ${otp.id}: hash ${email_hash.slice(0, 12)}...`);
      } else {
        // Use updateMany to skip conflicts (expired OTPs may already be gone)
        try {
          await prisma.oTP.update({ where: { id: otp.id }, data: { email_hash } });
        } catch {
          // Record may have been deleted (expired), ignore
        }
      }
      totalMigrated++;
    }

    console.log(`  Processed batch: ${batch.length} OTPs`);
    skip += BATCH;
  }

  return totalMigrated;
}

async function validateSample(prisma) {
  console.log('\n[Validate] Checking 5 random users...');
  const sample = await prisma.user.findMany({
    where: { NOT: { email_hash: null } },
    select: { id: true, email: true, email_hash: true, email_display: true, email_encrypted: true },
    take: 5,
  });

  let ok = 0;
  for (const u of sample) {
    const expectedHash = hashEmail(u.email);
    if (u.email_hash !== expectedHash) {
      console.error(`  [FAIL] User ${u.id}: hash mismatch!`);
    } else {
      console.log(`  [OK] ${u.email_display} — hash matches`);
      ok++;
    }
  }
  return ok === sample.length;
}

(async () => {
  if (DRY_RUN) console.log('[DRY RUN MODE — no changes will be written]\n');

  const prisma = new PrismaClient();

  try {
    const { totalMigrated: usersMigrated, totalSkipped } = await migrateUsers(prisma);
    const otpsMigrated = await migrateOTPs(prisma);

    if (!DRY_RUN && usersMigrated > 0) {
      const valid = await validateSample(prisma);
      if (!valid) {
        console.error('\n[ERROR] Validation failed — check logs above.');
        process.exit(1);
      }
    }

    console.log('\n─────────────────────────────');
    console.log(`Users migrated : ${usersMigrated}${DRY_RUN ? ' (dry)' : ''}`);
    console.log(`Users skipped  : ${totalSkipped}`);
    console.log(`OTPs migrated  : ${otpsMigrated}${DRY_RUN ? ' (dry)' : ''}`);
    console.log('─────────────────────────────');
    console.log(DRY_RUN ? '[DRY RUN complete]' : '[Migration complete]');
    console.log('\nNext steps:');
    console.log('  1. Verify the app works correctly with the new fields.');
    console.log('  2. When ready for Phase 2: clear the old email field by running a new migration.');
  } finally {
    await prisma.$disconnect();
  }
})();
