import { PrismaClient } from '@prisma/client';
import { seedId } from './ids';
import { daysAgo } from './clock';
import type { Catalog, ProductKey, UnitKey } from './catalog';

const DEFAULT_MIN_QUANTITY = 5;

export interface SeededInventory {
  idOf(unit: UnitKey, product: ProductKey): string;
  /** Ids of every stock row this seed owns, keyed by `${unit}/${product}`. */
  ids: Map<string, string>;
}

/**
 * Opens stock for every new menu line, then lands the balance the order book implies.
 *
 * Stock is written after the orders are planned but before they are inserted, because
 * the stored quantity has to be `opening - net movements`: the InventoryTransaction
 * ledger is the source of truth and a balance that does not replay from it is a bug
 * the seed would be teaching. The opening IN is dated well before any order so the
 * ledger reads in the order it happened.
 */
export async function seedInventory(
  prisma: PrismaClient,
  catalog: Catalog,
  netDeductions: Map<string, number>,
  openedById: string,
): Promise<SeededInventory> {
  const inventoryIds = new Map<string, string>();

  for (const entry of catalog.menu) {
    if (entry.openingStock === undefined) {
      continue;
    }

    const stockKey = `${entry.unit}/${entry.product}`;
    const consumed = netDeductions.get(stockKey) ?? 0;
    const quantity = entry.openingStock - consumed;
    if (quantity < 0) {
      throw new Error(
        `Seed orders consume ${String(consumed)} of ${stockKey} but only ${String(entry.openingStock)} was opened.`,
      );
    }

    const businessUnitId = catalog.unitIds[entry.unit];
    const productId = catalog.productIds[entry.product];

    // Looked up by natural key, not by the derived id, so a row that already exists
    // under a different id is adopted instead of colliding on the unique index. That
    // is what happens the moment the id NAMESPACE is bumped.
    const existing = await prisma.inventory.findUnique({
      where: { businessUnitId_productId: { businessUnitId, productId } },
    });
    if (existing) {
      inventoryIds.set(stockKey, existing.id);
      continue;
    }

    const inventoryId = seedId(`inventory:${stockKey}`);
    inventoryIds.set(stockKey, inventoryId);

    // One transaction for the pair: a row created without its opening entry would be
    // skipped by the guard above on every later run, leaving a balance that never
    // replays from its ledger.
    await prisma.$transaction([
      prisma.inventory.create({
        data: {
          id: inventoryId,
          businessUnitId,
          productId,
          quantity,
          minQuantity: entry.minQuantity ?? DEFAULT_MIN_QUANTITY,
          createdAt: daysAgo(90),
        },
      }),
      ...(entry.openingStock > 0
        ? [
            prisma.inventoryTransaction.create({
              data: {
                id: seedId(`inventory-tx:opening:${stockKey}`),
                inventoryId,
                createdBy: openedById,
                type: 'IN',
                quantity: entry.openingStock,
                reason: 'Opening balance (seed)',
                createdAt: daysAgo(90),
              },
            }),
          ]
        : []),
    ]);
  }

  return {
    ids: inventoryIds,
    idOf(unit: UnitKey, product: ProductKey): string {
      const inventoryId = inventoryIds.get(`${unit}/${product}`);
      if (!inventoryId) {
        throw new Error(`No inventory opened for ${unit}/${product}; an order cannot deduct it.`);
      }
      return inventoryId;
    },
  };
}

/**
 * Re-derives every seeded balance from its own ledger, after the order movements land.
 *
 * The opening write above only happens for rows that do not exist yet, so on a re-seed
 * against a database that already has the stock rows, a newly added order would insert
 * its OUT while the balance stayed put. Recomputing here is the same discipline
 * seedLoyaltyLedger applies to points: the stored number is set from the ledger, never
 * assumed. Mirrors the repository's own arithmetic - OUT decrements, every other type
 * increments - so rows the API moved since the last seed stay correct too.
 */
export async function reconcileInventoryBalances(
  prisma: PrismaClient,
  inventory: SeededInventory,
): Promise<void> {
  for (const inventoryId of inventory.ids.values()) {
    const [outgoing, incoming] = await Promise.all([
      prisma.inventoryTransaction.aggregate({
        _sum: { quantity: true },
        where: { inventoryId, type: 'OUT' },
      }),
      prisma.inventoryTransaction.aggregate({
        _sum: { quantity: true },
        where: { inventoryId, type: { not: 'OUT' } },
      }),
    ]);

    const balance = (incoming._sum.quantity ?? 0) - (outgoing._sum.quantity ?? 0);
    if (balance < 0) {
      throw new Error(`Inventory ${inventoryId} replays to a negative balance from its ledger.`);
    }

    await prisma.inventory.update({ where: { id: inventoryId }, data: { quantity: balance } });
  }
}
