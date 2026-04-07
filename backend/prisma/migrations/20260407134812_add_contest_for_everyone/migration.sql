-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_contests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'public',
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "maxPlayers" INTEGER,
    "botsCount" INTEGER NOT NULL DEFAULT 0,
    "forEveryone" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_contests" ("botsCount", "createdAt", "createdBy", "description", "endAt", "id", "maxPlayers", "name", "slug", "startAt", "status", "type", "updatedAt") SELECT "botsCount", "createdAt", "createdBy", "description", "endAt", "id", "maxPlayers", "name", "slug", "startAt", "status", "type", "updatedAt" FROM "contests";
DROP TABLE "contests";
ALTER TABLE "new_contests" RENAME TO "contests";
CREATE UNIQUE INDEX "contests_slug_key" ON "contests"("slug");
CREATE INDEX "contests_status_idx" ON "contests"("status");
CREATE INDEX "contests_slug_idx" ON "contests"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
