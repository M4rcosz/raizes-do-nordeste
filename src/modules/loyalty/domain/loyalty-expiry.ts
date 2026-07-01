import { LoyaltyTransactionType } from './value-objects/loyalty-transaction-type';

/** A point movement from the ledger, reduced to what point expiry needs. */
export interface LoyaltyLedgerEntry {
  type: LoyaltyTransactionType;
  /**
   * Points moved. EARN/REDEEM/EXPIRE are always positive (`type` carries the direction).
   * ADJUSTMENT is the exception: it is signed - positive credits, negative debits - so a
   * single type can represent both a refund (credit) and a clawback (debit).
   */
  points: number;
  createdAt: Date;
  /** Set only on EARN: when that lot expires. Null otherwise. */
  expiresAt: Date | null;
}

interface Lot {
  remaining: number;
  expiresAt: Date | null;
}

/**
 * How many points have expired as of `now`, reconstructed FIFO from the full ledger.
 *
 * Credits (EARN) become lots in earned order; debits (REDEEM, EXPIRE) and any prior
 * expiry consume the oldest lots first. After replaying every movement, the points
 * still sitting in lots whose expiry date has passed are the amount to expire now.
 * Because a future EXPIRE debit also consumes oldest-first, the lots this returns are
 * exactly the ones a recorded EXPIRE will drain - so a later sweep never double-counts.
 *
 * ADJUSTMENT is signed: a positive one is a non-expiring credit lot (refund/manual grant),
 * a negative one is a debit that consumes oldest-first (clawback), same as a redemption.
 */
export function computeExpiredPoints(ledger: LoyaltyLedgerEntry[], now: Date): number {
  const ordered = [...ledger].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const lots: Lot[] = [];
  const consume = (amount: number): void => {
    let left = amount;
    for (const lot of lots) {
      if (left <= 0) {
        break;
      }
      const taken = Math.min(lot.remaining, left);
      lot.remaining -= taken;
      left -= taken;
    }
  };

  for (const entry of ordered) {
    switch (entry.type) {
      case LoyaltyTransactionType.EARN:
        lots.push({ remaining: entry.points, expiresAt: entry.expiresAt });
        break;
      case LoyaltyTransactionType.ADJUSTMENT:
        // Signed: a credit becomes a non-expiring lot; a debit consumes oldest-first.
        if (entry.points >= 0) {
          lots.push({ remaining: entry.points, expiresAt: null });
        } else {
          consume(-entry.points);
        }
        break;
      case LoyaltyTransactionType.REDEEM:
      case LoyaltyTransactionType.EXPIRE:
        consume(entry.points);
        break;
    }
  }

  return lots.reduce(
    (sum, lot) =>
      lot.expiresAt && lot.expiresAt.getTime() < now.getTime() ? sum + lot.remaining : sum,
    0,
  );
}
