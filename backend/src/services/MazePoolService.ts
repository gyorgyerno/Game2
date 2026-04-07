// ─── MazePoolService ──────────────────────────────────────────────────────────
// Selectează un seed random din pool-ul maze_templates pentru un nivel dat.
// Evită repetițiile per user până la epuizarea pool-ului (via MazeTemplateUsage).
// Dacă pool-ul e gol → returnează null (caller decide fallback).

import type { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrisma = any;

export type MazePoolResult = {
  seed: number;
  shapeVariant: string;
  templateId: string;
} | null;

/**
 * Returnează un seed random nefolosit de userId pentru nivelul dat.
 * - Dacă toate seed-urile au fost folosite de user → resetează (șterge usages) și repornește
 * - Dacă pool-ul e complet gol → returnează null
 */
export async function getRandomMazeFromPool(
  prisma: PrismaClient,
  level: number,
  userId: string,
): Promise<MazePoolResult> {
  const db = prisma as AnyPrisma;
  // Seed-urile active pentru nivel
  const totalCount = await db.mazeTemplate.count({
    where: { level, isActive: true },
  });

  if (totalCount === 0) return null;

  // ID-urile deja folosite de acest user
  const used = await db.mazeTemplateUsage.findMany({
    where: { userId, level },
    select: { mazeTemplateId: true },
  });
  const usedIds = new Set(used.map((u: { mazeTemplateId: string }) => u.mazeTemplateId));

  // Dacă toate au fost folosite → reset
  if (usedIds.size >= totalCount) {
    await db.mazeTemplateUsage.deleteMany({ where: { userId, level } });
    usedIds.clear();
  }

  // Alege random dintre cele nefolosite
  // SQLite nu suportă RAND() în ORDER BY → fetch IDs și selectăm random în JS
  const available = await db.mazeTemplate.findMany({
    where: {
      level,
      isActive: true,
      id: usedIds.size > 0 ? { notIn: [...usedIds] } : undefined,
    },
    select: { id: true, seed: true, shapeVariant: true },
  });

  if (available.length === 0) return null;

  const picked = available[Math.floor(Math.random() * available.length)]!;

  // Marchează ca folosit
  await db.mazeTemplateUsage.create({
    data: { userId, level, mazeTemplateId: picked.id },
  });

  return { seed: picked.seed, shapeVariant: picked.shapeVariant, templateId: picked.id };
}
