-- Prisma does not emit CREATE EXTENSION for @db.Citext, so it goes here by hand.
-- Without it the ALTER below fails with: type "citext" does not exist.
CREATE EXTENSION IF NOT EXISTS citext;

-- Rebuilds the users_username_key unique index with case-insensitive comparison.
-- Fails loudly if two rows already collide case-insensitively (e.g. "joao" and
-- "Joao"); verify with:
--   SELECT lower(username) FROM users GROUP BY 1 HAVING count(*) > 1;
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "username" SET DATA TYPE CITEXT;
