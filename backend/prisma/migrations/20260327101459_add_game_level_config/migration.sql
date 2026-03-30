-- CreateTable
CREATE TABLE "game_level_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameType" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "difficultyValue" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxPlayers" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);

-- CreateIndex
CREATE INDEX "game_level_configs_gameType_isActive_idx" ON "game_level_configs"("gameType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "game_level_configs_gameType_level_key" ON "game_level_configs"("gameType", "level");
