-- CreateIndex
CREATE INDEX "orders_attendant_id_created_at_id_idx" ON "orders"("attendant_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "orders_total_amount_id_idx" ON "orders"("total_amount", "id");
