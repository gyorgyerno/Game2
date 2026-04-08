-- Add email security fields to users table
ALTER TABLE "users" ADD COLUMN "email_encrypted" TEXT;
ALTER TABLE "users" ADD COLUMN "email_hash"      TEXT;
ALTER TABLE "users" ADD COLUMN "email_display"   TEXT;

-- Unique index on email_hash (allows NULLs during migration period)
CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");

-- Add email_hash to OTP table for secure lookup
ALTER TABLE "otps" ADD COLUMN "email_hash" TEXT;

CREATE UNIQUE INDEX "otps_email_hash_key" ON "otps"("email_hash");
