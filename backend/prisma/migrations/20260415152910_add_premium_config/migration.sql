-- CreateTable
CREATE TABLE "premium_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxPlayersPerRoom" INTEGER NOT NULL DEFAULT 8,
    "maxRoomsPerDayUser" INTEGER NOT NULL DEFAULT 10,
    "maxRoundsPerRoom" INTEGER NOT NULL DEFAULT 20,
    "defaultTimeLimit" INTEGER NOT NULL DEFAULT 60,
    "maxSpectators" INTEGER NOT NULL DEFAULT 20,
    "allowGuestJoin" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
