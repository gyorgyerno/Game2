-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "userType" TEXT NOT NULL DEFAULT 'REAL',
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "league" TEXT NOT NULL DEFAULT 'bronze',
    "referralCode" TEXT,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("avatarUrl", "createdAt", "email", "id", "league", "rating", "referralCode", "updatedAt", "userType", "username", "xp") SELECT "avatarUrl", "createdAt", "email", "id", "league", "rating", "referralCode", "updatedAt", "userType", "username", "xp" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_rating_idx" ON "users"("rating");
CREATE INDEX "users_userType_idx" ON "users"("userType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
