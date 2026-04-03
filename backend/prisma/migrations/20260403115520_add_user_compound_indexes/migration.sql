-- CreateIndex
CREATE INDEX "users_userType_rating_idx" ON "users"("userType", "rating");

-- CreateIndex
CREATE INDEX "users_userType_createdAt_idx" ON "users"("userType", "createdAt");
