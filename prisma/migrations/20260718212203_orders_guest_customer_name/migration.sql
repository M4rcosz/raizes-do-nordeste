-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customer_name" VARCHAR(60);

-- An order identifies its customer by account OR by walk-up name, never both.
-- Enforced here and not only in CreateOrderUseCase because the read path collapses
-- the two into one display name: a row with both set would read back ambiguously,
-- and a writer that bypasses the use case (backfill, admin tool) would never notice.
-- Existing rows all have customer_name NULL, so they pass without a rewrite.
-- Deliberately not "at least one": legacy anonymous TOTEM rows are (NULL, NULL).
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_identity_exclusive"
  CHECK ("customer_id" IS NULL OR "customer_name" IS NULL);
