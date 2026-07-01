import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExpireLoyaltyPointsUseCase } from './expire-loyalty-points.use-case';
import type { LoyaltyRepository } from '@modules/loyalty/domain/repositories/loyalty.repository';
import type { LoyaltyLedgerEntry } from '@modules/loyalty/domain/loyalty-expiry';
import { LoyaltyTransactionType } from '@modules/loyalty/domain/value-objects/loyalty-transaction-type';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';

const now = new Date('2026-06-29T00:00:00.000Z');
const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** A ledger with `points` earned long ago and already past expiry. */
const expiredEarn = (points: number): LoyaltyLedgerEntry => ({
  type: LoyaltyTransactionType.EARN,
  points,
  createdAt: day('2025-01-01'),
  expiresAt: day('2026-01-01'),
});

describe('ExpireLoyaltyPointsUseCase', () => {
  let findAccountIds: jest.MockedFunction<LoyaltyRepository['findAccountIdsWithExpirablePoints']>;
  let findLedger: jest.MockedFunction<LoyaltyRepository['findLedger']>;
  let expire: jest.MockedFunction<LoyaltyRepository['expire']>;
  let useCase: ExpireLoyaltyPointsUseCase;

  beforeEach(() => {
    findAccountIds = jest.fn() as jest.MockedFunction<
      LoyaltyRepository['findAccountIdsWithExpirablePoints']
    >;
    findLedger = jest.fn() as jest.MockedFunction<LoyaltyRepository['findLedger']>;
    expire = jest.fn() as jest.MockedFunction<LoyaltyRepository['expire']>;

    const repo = {
      findAccountIdsWithExpirablePoints: findAccountIds,
      findLedger,
      expire,
    } as unknown as LoyaltyRepository;

    // Fake unit of work: runs the work immediately with a sentinel tx.
    const transactions: TransactionRunner = { run: (work) => work(Symbol('tx')) };

    useCase = new ExpireLoyaltyPointsUseCase(repo, transactions);
  });

  it('expires the computed total per candidate account and sums it', async () => {
    findAccountIds.mockResolvedValue(['la-1', 'la-2']);
    findLedger.mockResolvedValueOnce([expiredEarn(10)]).mockResolvedValueOnce([expiredEarn(3)]);
    expire.mockResolvedValue(true);

    const total = await useCase.execute(now);

    expect(total).toBe(13);
    expect(expire).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ loyaltyAccountId: 'la-1', points: 10 }),
      expect.anything(),
    );
    expect(expire).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ loyaltyAccountId: 'la-2', points: 3 }),
      expect.anything(),
    );
  });

  it('skips an account whose ledger nets to nothing to expire and never writes', async () => {
    findAccountIds.mockResolvedValue(['la-1']);
    // 10 expired but already redeemed in full: nothing left.
    findLedger.mockResolvedValue([
      expiredEarn(10),
      {
        type: LoyaltyTransactionType.REDEEM,
        points: 10,
        createdAt: day('2025-06-01'),
        expiresAt: null,
      },
    ]);

    const total = await useCase.execute(now);

    expect(total).toBe(0);
    expect(expire).not.toHaveBeenCalled();
  });

  it('counts 0 for an account where the conditional expire did not apply (concurrent debit)', async () => {
    findAccountIds.mockResolvedValue(['la-1']);
    findLedger.mockResolvedValue([expiredEarn(10)]);
    expire.mockResolvedValue(false);

    const total = await useCase.execute(now);

    expect(total).toBe(0);
  });

  it('does nothing when no account is eligible', async () => {
    findAccountIds.mockResolvedValue([]);

    const total = await useCase.execute(now);

    expect(total).toBe(0);
    expect(findLedger).not.toHaveBeenCalled();
  });
});
