/*
  Warnings:

  - You are about to drop the `app_config` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "app_config";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "game_scoring_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameType" TEXT NOT NULL,
    "level" INTEGER,
    "pointsPerCorrect" INTEGER,
    "pointsPerMistake" INTEGER,
    "bonusFirstFinisher" INTEGER,
    "bonusCompletion" INTEGER,
    "timeLimitSeconds" INTEGER,
    "forfeitBonus" INTEGER,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "game_scoring_configs_gameType_idx" ON "game_scoring_configs"("gameType");

-- CreateIndex
CREATE UNIQUE INDEX "game_scoring_configs_gameType_level_key" ON "game_scoring_configs"("gameType", "level");
