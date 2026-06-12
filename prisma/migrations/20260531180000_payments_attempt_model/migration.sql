-- A Payment becomes one *attempt*: an order may have many attempts, at most one
-- live/settled at a time. This replaces "one payment per order" with a retriable model.

-- Drop the old "one payment per order" unique constraint.
DROP INDEX "payments_order_id_key";

-- Plain lookup index on order_id (replaces the dropped unique).
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- ext_transaction_id is now unique (matches @unique in schema; lets us use findUnique).
-- NULLs are distinct in Postgres, so reserved-but-not-yet-charged rows are unaffected.
CREATE UNIQUE INDEX "payments_ext_transaction_id_key" ON "payments"("ext_transaction_id");

-- At most one *live* attempt per order. This partial unique index is the single
-- concurrency guard: a second concurrent create (or one while a payment is in
-- flight/approved) fails with P2002 *before* the gateway is charged. REFUSED/CANCELLED
-- do not occupy the slot, so a refused order can be paid again.
CREATE UNIQUE INDEX "payments_order_id_active_key"
  ON "payments"("order_id")
  WHERE "status" IN ('PENDING', 'PROCESSING', 'APPROVED');
