import { PrismaClient } from '@prisma/client';
import { seedCatalog } from './catalog';
import { seedPeople } from './people';
import { seedPromotions } from './promotions';
import { buildOrderPlan, writeOrders } from './orders';
import { reconcileInventoryBalances, seedInventory } from './inventory';
import { seedLoyaltyLedger } from './loyalty';
import { seedAi } from './ai';
import { seedAuditTrail } from './audit';

export interface ExpansionInput {
  /** The two units the base seed creates; referenced here, never rewritten. */
  unit1Id: string;
  unit2Id: string;
  adminId: string;
  /** Reused so the 17 new accounts are not hashed one by one for the same password. */
  passwordHash: string;
}

/**
 * Everything the base seed does not cover: three more units, five more categories,
 * twenty-one products, per-unit menus with stock, staff and customers, promotions in
 * every state, a twenty-order book with payments, loyalty and stock movements, AI
 * threads with their spend, and an audit trail over all of it.
 *
 * Ordering is a real constraint, not a preference:
 * catalog -> people -> promotions, then the order book is *planned in memory* before
 * inventory is written, because opening stock has to account for what the orders
 * consume. Loyalty balances are set last, from the ledger the orders produced.
 */
export async function seedExpansion(prisma: PrismaClient, input: ExpansionInput): Promise<void> {
  const catalog = await seedCatalog(prisma, {
    unit1Id: input.unit1Id,
    unit2Id: input.unit2Id,
  });
  const people = await seedPeople(prisma, catalog, input.passwordHash);
  const promotions = await seedPromotions(prisma, catalog);

  const plan = buildOrderPlan(catalog, people, promotions, input.adminId);

  const inventory = await seedInventory(prisma, catalog, plan.netDeductions, input.adminId);
  await writeOrders(prisma, plan, (unit, product) => inventory.idOf(unit, product));
  // Both balances are set from their ledgers only after the movements exist, so a
  // re-seed onto an existing database converges instead of drifting.
  await reconcileInventoryBalances(prisma, inventory);
  await seedLoyaltyLedger(prisma, people, plan.pointDeltas);

  await seedAi(prisma, people);
  await seedAuditTrail(prisma, {
    catalog,
    people,
    promotions,
    plan,
    adminId: input.adminId,
  });
}
