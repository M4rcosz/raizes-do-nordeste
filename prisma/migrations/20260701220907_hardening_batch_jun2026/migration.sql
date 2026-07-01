-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "loyalty_accounts" ADD COLUMN     "consent_revoked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "loyalty_transactions" ADD COLUMN     "expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "user_business_units" (
    "user_id" TEXT NOT NULL,
    "business_unit_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_business_units_pkey" PRIMARY KEY ("user_id","business_unit_id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_business_units_business_unit_id_idx" ON "user_business_units"("business_unit_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_endpoint_key_key" ON "idempotency_keys"("user_id", "endpoint", "key");

-- CreateIndex
CREATE INDEX "inventories_business_unit_id_created_at_id_idx" ON "inventories"("business_unit_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "loyalty_transactions_expires_at_idx" ON "loyalty_transactions"("expires_at");

-- CreateIndex
CREATE INDEX "users_created_at_id_idx" ON "users"("created_at", "id");

-- AddForeignKey
ALTER TABLE "user_business_units" ADD CONSTRAINT "user_business_units_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_business_units" ADD CONSTRAINT "user_business_units_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
