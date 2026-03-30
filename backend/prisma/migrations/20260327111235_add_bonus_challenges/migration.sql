-- CreateTable
CREATE TABLE "bonus_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameType" TEXT NOT NULL,
    "challengeType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "requiredValue" INTEGER NOT NULL,
    "bonusPoints" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bonus_challenge_awards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bonusChallengeId" TEXT NOT NULL,
    "awardedPoints" INTEGER NOT NULL,
    "awardedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bonus_challenge_awards_bonusChallengeId_fkey" FOREIGN KEY ("bonusChallengeId") REFERENCES "bonus_challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bonus_challenges_gameType_isActive_idx" ON "bonus_challenges"("gameType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "bonus_challenge_awards_userId_bonusChallengeId_key" ON "bonus_challenge_awards"("userId", "bonusChallengeId");
