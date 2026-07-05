/*
  Warnings:

  - Added the required column `updated_at` to the `categories` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- updated_at is app-managed (@updatedAt, no schema default). Add it with a
-- transient DEFAULT to backfill the existing rows, then drop the default so the
-- column matches the Prisma schema and no drift is reported.
ALTER TABLE "categories" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "description" DROP NOT NULL;

ALTER TABLE "categories" ALTER COLUMN "updated_at" DROP DEFAULT;
