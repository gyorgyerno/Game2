-- CreateTable: persist per-user solo game progress
CREATE TABLE "user_solo_game_progress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "gameType" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "gameIndex" INTEGER NOT NULL,
  "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_solo_game_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_solo_game_progress_userId_gameType_level_gameIndex_key"
ON "user_solo_game_progress" ("userId", "gameType", "level", "gameIndex");

-- CreateIndex
CREATE INDEX "user_solo_game_progress_userId_gameType_level_idx"
ON "user_solo_game_progress" ("userId", "gameType", "level");