-- CreateTable
CREATE TABLE "contests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "maxPlayers" INTEGER,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "contest_players" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contest_players_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contest_games" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    CONSTRAINT "contest_games_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contest_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "matchId" TEXT,
    "score" INTEGER NOT NULL,
    "timeTaken" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contest_scores_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "winsToUnlock" INTEGER NOT NULL DEFAULT 5,
    "gamesPerLevel" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);
INSERT INTO "new_game_level_configs" ("createdAt", "difficultyValue", "displayName", "gameType", "gamesPerLevel", "id", "isActive", "level", "maxPlayers", "updatedAt", "updatedBy", "winsToUnlock") SELECT "createdAt", "difficultyValue", "displayName", "gameType", "gamesPerLevel", "id", "isActive", "level", "maxPlayers", "updatedAt", "updatedBy", "winsToUnlock" FROM "game_level_configs";
DROP TABLE "game_level_configs";
ALTER TABLE "new_game_level_configs" RENAME TO "game_level_configs";
CREATE INDEX "game_level_configs_gameType_isActive_idx" ON "game_level_configs"("gameType", "isActive");
CREATE UNIQUE INDEX "game_level_configs_gameType_level_key" ON "game_level_configs"("gameType", "level");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "contests_slug_key" ON "contests"("slug");

-- CreateIndex
CREATE INDEX "contests_status_idx" ON "contests"("status");

-- CreateIndex
CREATE INDEX "contests_slug_idx" ON "contests"("slug");

-- CreateIndex
CREATE INDEX "contest_players_contestId_idx" ON "contest_players"("contestId");

-- CreateIndex
CREATE INDEX "contest_players_userId_idx" ON "contest_players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contest_players_contestId_userId_key" ON "contest_players"("contestId", "userId");

-- CreateIndex
CREATE INDEX "contest_games_contestId_idx" ON "contest_games"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "contest_games_contestId_gameType_key" ON "contest_games"("contestId", "gameType");

-- CreateIndex
CREATE INDEX "contest_scores_contestId_userId_idx" ON "contest_scores"("contestId", "userId");

-- CreateIndex
CREATE INDEX "contest_scores_contestId_gameType_idx" ON "contest_scores"("contestId", "gameType");
