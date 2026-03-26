-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "avatarGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
