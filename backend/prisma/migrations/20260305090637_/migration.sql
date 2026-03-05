-- AddColumn
ALTER TABLE "users" ADD COLUMN "userType" TEXT NOT NULL DEFAULT 'REAL';

-- CreateTable
CREATE TABLE "ai_player_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillLevel" INTEGER NOT NULL DEFAULT 5,
    "thinkingSpeedMsMin" INTEGER NOT NULL DEFAULT 2500,
    "thinkingSpeedMsMax" INTEGER NOT NULL DEFAULT 6000,
    "mistakeRate" REAL NOT NULL DEFAULT 0.12,
    "hesitationProbability" REAL NOT NULL DEFAULT 0.18,
    "correctionProbability" REAL NOT NULL DEFAULT 0.35,
    "playStyle" TEXT NOT NULL DEFAULT 'balanced',
    "personality" TEXT NOT NULL DEFAULT 'CASUAL_PLAYER',
    "preferredGames" TEXT NOT NULL DEFAULT '[]',
    "onlineProbability" REAL NOT NULL DEFAULT 0.35,
    "chatProbability" REAL NOT NULL DEFAULT 0.06,
    "sessionLengthMin" INTEGER NOT NULL DEFAULT 8,
    "sessionLengthMax" INTEGER NOT NULL DEFAULT 25,
    "activityPattern" TEXT NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ai_player_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_skill_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "averageCompletionTime" REAL NOT NULL DEFAULT 0,
    "mistakeRate" REAL NOT NULL DEFAULT 0,
    "successRate" REAL NOT NULL DEFAULT 0,
    "preferredGameTypes" TEXT NOT NULL DEFAULT '[]',
    "winLossRatio" REAL NOT NULL DEFAULT 1,
    "hintUsageRate" REAL NOT NULL DEFAULT 0,
    "correctionRate" REAL NOT NULL DEFAULT 0,
    "pathEfficiency" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "player_skill_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ghost_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "moves" TEXT NOT NULL DEFAULT '[]',
    "timestamps" TEXT NOT NULL DEFAULT '[]',
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "corrections" INTEGER NOT NULL DEFAULT 0,
    "completionTime" REAL NOT NULL DEFAULT 0,
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ghost_runs_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bot_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxBotsOnline" INTEGER NOT NULL DEFAULT 6,
    "botScoreLimit" INTEGER NOT NULL DEFAULT 5000,
    "activityFeedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "chatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "users_userType_idx" ON "users"("userType");

-- CreateIndex
CREATE UNIQUE INDEX "ai_player_profiles_userId_key" ON "ai_player_profiles"("userId");

-- CreateIndex
CREATE INDEX "ai_player_profiles_enabled_idx" ON "ai_player_profiles"("enabled");

-- CreateIndex
CREATE INDEX "ai_player_profiles_skillLevel_idx" ON "ai_player_profiles"("skillLevel");

-- CreateIndex
CREATE UNIQUE INDEX "player_skill_profiles_userId_key" ON "player_skill_profiles"("userId");

-- CreateIndex
CREATE INDEX "ghost_runs_playerId_gameType_idx" ON "ghost_runs"("playerId", "gameType");

-- CreateIndex
CREATE INDEX "ghost_runs_createdAt_idx" ON "ghost_runs"("createdAt");
