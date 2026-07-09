-- Push the non-negativity invariant down into the database, where a seed, a raw SQL
-- fix or a future write path cannot bypass it. Until now it lived only in the OUT
-- guard of applyMovement and in the DTO @Min(0).
--
-- Note the UPPER bound is deliberately absent: `quantity` is int4, so the type
-- already rejects anything past 2147483647. A CHECK for it would be a tautology, and
-- it would not help anyway - the overflow raises while evaluating `quantity + n`,
-- before any CHECK runs. That bound stays in the app (MAX_INVENTORY_QUANTITY), which
-- turns it into a 422 instead of a 500.
--
-- Prisma does not model CHECK constraints, so these live only here. They are not
-- reported as drift, but `prisma migrate diff` will never recreate them either.

ALTER TABLE "inventories"
  ADD CONSTRAINT "inventories_quantity_non_negative" CHECK ("quantity" >= 0);

ALTER TABLE "inventories"
  ADD CONSTRAINT "inventories_min_quantity_non_negative" CHECK ("min_quantity" >= 0);

-- The ledger records magnitudes; direction is carried by `type`. A zero-quantity IN
-- is legal: it is the genesis entry of a stock row opened with no units.
ALTER TABLE "inventory_transactions"
  ADD CONSTRAINT "inventory_transactions_quantity_non_negative" CHECK ("quantity" >= 0);
