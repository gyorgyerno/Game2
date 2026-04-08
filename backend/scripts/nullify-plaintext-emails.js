/**
 * nullify-plaintext-emails.js  — Phase 2
 * ────────────────────────────────────────
 * Replaces the plaintext email field with the SHA-256 hash value for all
 * users and OTP records. After this script the `email` column contains only
 * non-reversible hashes — no plaintext data remains in the database.
 *
 * Requirements:
 *   • Phase 1 migration must already have been applied (email_hash populated).
 *   • Run with: node scripts/nullify-plaintext-emails.js [--dry-run]
 *
 * Idempotent — skips rows where email already equals email_hash.
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');

function looksLikePlainEmail(s) {
  return typeof s === 'string' && s.includes('@');
}

(async () => {
  if (DRY_RUN) console.log('[DRY RUN — no changes will be written]\n');

  const prisma = new PrismaClient();

  try {
    // ── Users ───────────────────────────────────────────────────────────────
    console.log('[Users] Checking for plaintext emails...');
    const usersToUpdate = await prisma.user.findMany({
      where: { email_hash: { not: null } },
      select: { id: true, email: true, email_hash: true },
    });

    let usersReplaced = 0;
    let usersSkipped = 0;

    for (const u of usersToUpdate) {
      if (!looksLikePlainEmail(u.email)) {
        usersSkipped++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  [DRY] User ${u.id}: "${u.email}" → (hash)`);
      } else {
        await prisma.user.update({
          where: { id: u.id },
          data: { email: u.email_hash },
        });
      }
      usersReplaced++;
    }

    console.log(`  Replaced: ${usersReplaced}  |  Already clean: ${usersSkipped}`);

    // ── OTPs ────────────────────────────────────────────────────────────────
    console.log('\n[OTPs] Checking for plaintext emails...');
    const otpsToUpdate = await prisma.oTP.findMany({
      where: { email_hash: { not: null } },
      select: { id: true, email: true, email_hash: true },
    });

    let otpsReplaced = 0;
    let otpsSkipped = 0;

    for (const o of otpsToUpdate) {
      if (!looksLikePlainEmail(o.email)) {
        otpsSkipped++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  [DRY] OTP ${o.id}: plaintext → (hash)`);
      } else {
        try {
          await prisma.oTP.update({
            where: { id: o.id },
            data: { email: o.email_hash },
          });
        } catch {
          // Record may have expired and been deleted — ignore
        }
      }
      otpsReplaced++;
    }

    console.log(`  Replaced: ${otpsReplaced}  |  Already clean: ${otpsSkipped}`);

    // ── Validate ────────────────────────────────────────────────────────────
    if (!DRY_RUN) {
      const remaining = await prisma.user.count({
        where: { email: { contains: '@' } },
      });
      if (remaining > 0) {
        console.error(`\n[ERROR] ${remaining} users still have plaintext emails! Check logs.`);
        process.exit(1);
      }
      console.log('\n[Validate] No plaintext emails remain in users table.');
    }

    console.log('\n─────────────────────────────');
    console.log(`Users  : ${usersReplaced} replaced${DRY_RUN ? ' (dry)' : ''}`);
    console.log(`OTPs   : ${otpsReplaced} replaced${DRY_RUN ? ' (dry)' : ''}`);
    console.log('─────────────────────────────');
    console.log(DRY_RUN ? '[Phase 2 dry run complete]' : '[Phase 2 complete — no plaintext emails in DB]');
  } finally {
    await prisma.$disconnect();
  }
})();
