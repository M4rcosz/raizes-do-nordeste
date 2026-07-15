-- CreateTable
CREATE TABLE "ai_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "ai_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_memberships_user_id_key" ON "ai_memberships"("user_id");

-- AddForeignKey
ALTER TABLE "ai_memberships" ADD CONSTRAINT "ai_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_memberships" ADD CONSTRAINT "ai_memberships_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
