import { PrismaClient, type LoyaltyTransactionType } from '@prisma/client';
import { seedId } from './ids';
import { daysAgo } from './clock';
import type { CustomerKey, People } from './people';

interface ManualMovement {
  key: string;
  customer: CustomerKey;
  type: Extract<LoyaltyTransactionType, 'ADJUSTMENT' | 'EXPIRE'>;
  /** ADJUSTMENT is signed (credit or clawback); EXPIRE is always positive. */
  points: number;
  description: string;
  daysAgo: number;
}

// Movements with no order behind them: welcome credits, a clawback, an expiry sweep.
// They are what gives customers a balance to redeem from before their first seeded
// order, and they exercise the branches of the ledger that orders never reach.
const MANUAL_MOVEMENTS: ManualMovement[] = [
  {
    key: 'ana-welcome',
    customer: 'ana',
    type: 'ADJUSTMENT',
    points: 50,
    description: 'Welcome bonus',
    daysAgo: 190,
  },
  {
    key: 'bruno-welcome',
    customer: 'bruno',
    type: 'ADJUSTMENT',
    points: 50,
    description: 'Welcome bonus',
    daysAgo: 150,
  },
  {
    key: 'carla-recovery',
    customer: 'carla',
    type: 'ADJUSTMENT',
    points: 12,
    description: 'Service recovery credit',
    daysAgo: 40,
  },
  {
    key: 'daniel-migration',
    customer: 'daniel',
    type: 'ADJUSTMENT',
    points: 30,
    description: 'Balance migrated from the old punch card',
    daysAgo: 60,
  },
  {
    key: 'daniel-expiry',
    customer: 'daniel',
    type: 'EXPIRE',
    points: 5,
    description: 'Points expired after 12 months',
    daysAgo: 25,
  },
  {
    key: 'erika-welcome',
    customer: 'erika',
    type: 'ADJUSTMENT',
    points: 20,
    description: 'Welcome bonus',
    daysAgo: 190,
  },
  {
    key: 'erika-clawback',
    customer: 'erika',
    type: 'ADJUSTMENT',
    points: -8,
    description: 'Clawback after refunded order',
    daysAgo: 20,
  },
  {
    key: 'felipe-migration',
    customer: 'felipe',
    type: 'ADJUSTMENT',
    points: 25,
    description: 'Balance migrated from the old punch card',
    daysAgo: 100,
  },
];

/**
 * Writes the manual movements, then sets every balance to the sum of its own ledger.
 *
 * The balance is set, never incremented: re-running the seed must land on the same
 * number instead of drifting upward, and a totalPoints that disagreed with the ledger
 * would make the account read differently depending on which one you asked.
 */
export async function seedLoyaltyLedger(
  prisma: PrismaClient,
  people: People,
  orderPointDeltas: Map<CustomerKey, number>,
): Promise<void> {
  const balances = new Map<CustomerKey, number>(orderPointDeltas);

  for (const movement of MANUAL_MOVEMENTS) {
    const accountId = people.loyaltyAccountIds[movement.customer];
    if (!accountId) {
      throw new Error(`Manual movement ${movement.key} targets a customer with no account.`);
    }

    await prisma.loyaltyTransaction.upsert({
      where: { id: seedId(`loyalty-tx:manual:${movement.key}`) },
      update: {},
      create: {
        id: seedId(`loyalty-tx:manual:${movement.key}`),
        loyaltyAccountId: accountId,
        type: movement.type,
        // Stored as given: EXPIRE is positive and the type carries the direction,
        // while ADJUSTMENT is signed, so a clawback must persist as a negative.
        points: movement.points,
        description: movement.description,
        createdAt: daysAgo(movement.daysAgo),
      },
    });

    // EXPIRE is stored positive but always debits; ADJUSTMENT carries its own sign.
    const signed = movement.type === 'EXPIRE' ? -movement.points : movement.points;
    balances.set(movement.customer, (balances.get(movement.customer) ?? 0) + signed);
  }

  for (const [customer, balance] of balances) {
    const accountId = people.loyaltyAccountIds[customer];
    if (!accountId) {
      continue;
    }
    if (balance < 0) {
      throw new Error(`Seed ledger leaves ${customer} with a negative balance.`);
    }

    await prisma.loyaltyAccount.update({
      where: { id: accountId },
      data: { totalPoints: balance },
    });
  }
}
