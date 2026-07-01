import { describe, expect, it } from '@jest/globals';
import { computeExpiredPoints, type LoyaltyLedgerEntry } from './loyalty-expiry';
import { LoyaltyTransactionType } from './value-objects/loyalty-transaction-type';

const now = new Date('2026-06-29T00:00:00.000Z');
const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const earn = (points: number, createdAt: string, expiresAt: string): LoyaltyLedgerEntry => ({
  type: LoyaltyTransactionType.EARN,
  points,
  createdAt: day(createdAt),
  expiresAt: day(expiresAt),
});
const redeem = (points: number, createdAt: string): LoyaltyLedgerEntry => ({
  type: LoyaltyTransactionType.REDEEM,
  points,
  createdAt: day(createdAt),
  expiresAt: null,
});
const expire = (points: number, createdAt: string): LoyaltyLedgerEntry => ({
  type: LoyaltyTransactionType.EXPIRE,
  points,
  createdAt: day(createdAt),
  expiresAt: null,
});

describe('computeExpiredPoints', () => {
  it('returns 0 for an empty ledger', () => {
    expect(computeExpiredPoints([], now)).toBe(0);
  });

  it('does not expire a lot still within its window', () => {
    // Earned recently, expires in 2026-12: nothing past now.
    expect(computeExpiredPoints([earn(10, '2025-12-01', '2026-12-01')], now)).toBe(0);
  });

  it('expires the full remaining of a lot past its expiry date', () => {
    expect(computeExpiredPoints([earn(10, '2025-01-01', '2026-01-01')], now)).toBe(10);
  });

  it('nets redemptions FIFO against the oldest lot before expiring', () => {
    // 10 earned (expires 2026-01, past), then 4 redeemed: 6 remain in the expired lot.
    const ledger = [earn(10, '2025-01-01', '2026-01-01'), redeem(4, '2025-06-01')];
    expect(computeExpiredPoints(ledger, now)).toBe(6);
  });

  it('redemptions consume the oldest lot first, sparing a newer still-valid lot', () => {
    // Old lot 5 (expired) + new lot 5 (valid). A redemption of 5 eats the old lot,
    // so nothing is left to expire.
    const ledger = [
      earn(5, '2025-01-01', '2026-01-01'),
      earn(5, '2026-03-01', '2027-03-01'),
      redeem(5, '2026-04-01'),
    ];
    expect(computeExpiredPoints(ledger, now)).toBe(0);
  });

  it('does not double-count points a prior EXPIRE already consumed', () => {
    // 10 expired earlier, an EXPIRE of 10 recorded: the lot is drained, nothing left.
    const ledger = [earn(10, '2025-01-01', '2026-01-01'), expire(10, '2026-01-02')];
    expect(computeExpiredPoints(ledger, now)).toBe(0);
  });

  it('only expires the part of a mixed balance that is past its window', () => {
    // Expired lot 8 + valid lot 5. Only the 8 expire.
    const ledger = [earn(8, '2025-01-01', '2026-01-01'), earn(5, '2026-03-01', '2027-03-01')];
    expect(computeExpiredPoints(ledger, now)).toBe(8);
  });

  it('treats a positive ADJUSTMENT as a non-expiring credit lot', () => {
    const ledger: LoyaltyLedgerEntry[] = [
      {
        type: LoyaltyTransactionType.ADJUSTMENT,
        points: 7,
        createdAt: day('2024-01-01'),
        expiresAt: null,
      },
    ];
    expect(computeExpiredPoints(ledger, now)).toBe(0);
  });

  it('treats a negative ADJUSTMENT (clawback) as a debit consuming the oldest lot', () => {
    // 10 earned (expired), then a -6 clawback adjustment: 4 remain to expire.
    const ledger: LoyaltyLedgerEntry[] = [
      earn(10, '2025-01-01', '2026-01-01'),
      {
        type: LoyaltyTransactionType.ADJUSTMENT,
        points: -6,
        createdAt: day('2026-02-01'),
        expiresAt: null,
      },
    ];
    expect(computeExpiredPoints(ledger, now)).toBe(4);
  });
});
