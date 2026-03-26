-- CreateTable
CREATE TABLE "friendships" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "senderId"   TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'pending',
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL,
    CONSTRAINT "friendships_senderId_fkey"   FOREIGN KEY ("senderId")   REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "friendships_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "friendships_senderId_receiverId_key" ON "friendships"("senderId", "receiverId");
