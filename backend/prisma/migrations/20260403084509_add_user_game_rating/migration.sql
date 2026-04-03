-- CreateTable
CREATE TABLE "user_game_ratings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "league" TEXT NOT NULL DEFAULT 'bronze',
    CONSTRAINT "user_game_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "user_game_ratings_userId_idx" ON "user_game_ratings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_game_ratings_userId_gameType_key" ON "user_game_ratings"("userId", "gameType");
