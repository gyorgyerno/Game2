-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_game_level_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameType" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "difficultyValue" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxPlayers" INTEGER NOT NULL DEFAULT 2,
    "roundCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);
INSERT INTO "new_game_level_configs" ("createdAt", "difficultyValue", "displayName", "gameType", "id", "isActive", "level", "maxPlayers", "updatedAt", "updatedBy") SELECT "createdAt", "difficultyValue", "displayName", "gameType", "id", "isActive", "level", "maxPlayers", "updatedAt", "updatedBy" FROM "game_level_configs";
DROP TABLE "game_level_configs";
ALTER TABLE "new_game_level_configs" RENAME TO "game_level_configs";
CREATE INDEX "game_level_configs_gameType_isActive_idx" ON "game_level_configs"("gameType", "isActive");
CREATE UNIQUE INDEX "game_level_configs_gameType_level_key" ON "game_level_configs"("gameType", "level");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
