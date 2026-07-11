-- Canonicalize existing emails before the type change. On a clean DB this is a
-- no-op. On one with legacy mixed-case rows it lowercases them so stored values are
-- canonical; if two rows only differed by case, this UPDATE hits the existing
-- (case-sensitive) unique index and fails the migration loudly instead of letting
-- the citext index silently reject one later. Resolve such duplicates by hand first.
UPDATE "users" SET "email" = lower("email") WHERE "email" IS NOT NULL AND "email" <> lower("email");

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE CITEXT;
