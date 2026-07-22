-- CreateIndex
CREATE INDEX "business_unit_menu_items_business_unit_id_created_at_id_idx" ON "business_unit_menu_items"("business_unit_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "business_units_created_at_id_idx" ON "business_units"("created_at", "id");

-- CreateIndex
CREATE INDEX "categories_created_at_id_idx" ON "categories"("created_at", "id");

-- CreateIndex
CREATE INDEX "products_created_at_id_idx" ON "products"("created_at", "id");

-- CreateIndex
CREATE INDEX "promotions_business_unit_id_created_at_id_idx" ON "promotions"("business_unit_id", "created_at", "id");
