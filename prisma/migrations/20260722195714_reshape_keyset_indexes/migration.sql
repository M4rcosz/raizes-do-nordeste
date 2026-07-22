-- DropIndex
DROP INDEX "ai_conversations_user_id_updated_at_idx";

-- DropIndex
DROP INDEX "categories_created_at_id_idx";

-- DropIndex
DROP INDEX "products_created_at_id_idx";

-- DropIndex
DROP INDEX "products_is_active_idx";

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_updated_at_id_idx" ON "ai_conversations"("user_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "ai_memberships_created_at_id_idx" ON "ai_memberships"("created_at", "id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs"("created_at", "id");

-- CreateIndex
CREATE INDEX "categories_is_active_created_at_id_idx" ON "categories"("is_active", "created_at", "id");

-- CreateIndex
CREATE INDEX "products_is_active_created_at_id_idx" ON "products"("is_active", "created_at", "id");
