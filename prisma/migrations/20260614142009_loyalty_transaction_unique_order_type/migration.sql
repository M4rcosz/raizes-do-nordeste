/*
  Warnings:

  - A unique constraint covering the columns `[order_id,type]` on the table `loyalty_transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "loyalty_transactions_order_id_type_key" ON "loyalty_transactions"("order_id", "type");
