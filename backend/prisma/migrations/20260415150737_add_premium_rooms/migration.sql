-- CreateTable
CREATE TABLE "premium_rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "mode" TEXT NOT NULL DEFAULT 'quick',
    "maxPlayers" INTEGER NOT NULL DEFAULT 8,
    "allowSpectators" BOOLEAN NOT NULL DEFAULT false,
    "startAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "premium_rooms_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "premium_room_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "gameType" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "timeLimit" INTEGER NOT NULL DEFAULT 180,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isFinished" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "premium_room_rounds_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "premium_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "premium_room_players" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "premium_room_players_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "premium_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "premium_room_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "timeTaken" INTEGER,
    "position" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "premium_room_scores_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "premium_room_rounds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "email_encrypted" TEXT,
    "email_hash" TEXT,
    "email_display" TEXT,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "userType" TEXT NOT NULL DEFAULT 'REAL',
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "league" TEXT NOT NULL DEFAULT 'bronze',
    "referralCode" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "lastIp" TEXT,
    "platform" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("avatarUrl", "createdAt", "email", "email_display", "email_encrypted", "email_hash", "id", "isBanned", "lastIp", "league", "platform", "rating", "referralCode", "updatedAt", "userType", "username", "xp") SELECT "avatarUrl", "createdAt", "email", "email_display", "email_encrypted", "email_hash", "id", "isBanned", "lastIp", "league", "platform", "rating", "referralCode", "updatedAt", "userType", "username", "xp" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_rating_idx" ON "users"("rating");
CREATE INDEX "users_userType_idx" ON "users"("userType");
CREATE INDEX "users_userType_rating_idx" ON "users"("userType", "rating");
CREATE INDEX "users_userType_createdAt_idx" ON "users"("userType", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "premium_rooms_code_key" ON "premium_rooms"("code");

-- CreateIndex
CREATE INDEX "premium_rooms_ownerId_idx" ON "premium_rooms"("ownerId");

-- CreateIndex
CREATE INDEX "premium_rooms_status_idx" ON "premium_rooms"("status");

-- CreateIndex
CREATE INDEX "premium_room_rounds_roomId_idx" ON "premium_room_rounds"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "premium_room_rounds_roomId_order_key" ON "premium_room_rounds"("roomId", "order");

-- CreateIndex
CREATE INDEX "premium_room_players_roomId_idx" ON "premium_room_players"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "premium_room_players_roomId_userId_key" ON "premium_room_players"("roomId", "userId");

-- CreateIndex
CREATE INDEX "premium_room_scores_roundId_idx" ON "premium_room_scores"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "premium_room_scores_roundId_userId_key" ON "premium_room_scores"("roundId", "userId");
