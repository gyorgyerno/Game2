/*
  Warnings:

  - You are about to drop the `contest_games` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `roundId` to the `contest_scores` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "contest_games_contestId_gameType_key";

-- DropIndex
DROP INDEX "contest_games_contestId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "contest_games";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "contest_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "minLevel" INTEGER NOT NULL DEFAULT 1,
    "matchesCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "contest_rounds_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_contest_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "matchId" TEXT,
    "score" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "timeTaken" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contest_scores_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contest_scores_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "contest_rounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_contest_scores" ("contestId", "createdAt", "gameType", "id", "matchId", "score", "timeTaken", "userId") SELECT "contestId", "createdAt", "gameType", "id", "matchId", "score", "timeTaken", "userId" FROM "contest_scores";
DROP TABLE "contest_scores";
ALTER TABLE "new_contest_scores" RENAME TO "contest_scores";
CREATE INDEX "contest_scores_contestId_userId_idx" ON "contest_scores"("contestId", "userId");
CREATE INDEX "contest_scores_contestId_roundId_idx" ON "contest_scores"("contestId", "roundId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "contest_rounds_contestId_idx" ON "contest_rounds"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "contest_rounds_contestId_order_key" ON "contest_rounds"("contestId", "order");
