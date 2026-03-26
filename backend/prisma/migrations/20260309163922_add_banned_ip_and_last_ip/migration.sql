-- AlterTable
ALTER TABLE "users" ADD COLUMN "lastIp" TEXT;

-- CreateTable
CREATE TABLE "banned_ips" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'ban_user',
    "bannedUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "banned_ips_ip_key" ON "banned_ips"("ip");
