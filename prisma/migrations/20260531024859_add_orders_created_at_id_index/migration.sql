-- DropIndex
DROP INDEX "orders_created_at_idx";

-- CreateIndex
CREATE INDEX "orders_created_at_id_idx" ON "orders"("created_at", "id");
