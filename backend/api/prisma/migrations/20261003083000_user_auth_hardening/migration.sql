-- AlterTable
ALTER TABLE "User" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Comptes existants avec email technique → marqués guest (évite claim abusif sur vrais comptes)
UPDATE "User"
SET "isGuest" = true
WHERE "role" = 'CLIENT'
  AND (
    "email" ILIKE '%@anon.local'
    OR "email" ILIKE 'anon_%'
  );
