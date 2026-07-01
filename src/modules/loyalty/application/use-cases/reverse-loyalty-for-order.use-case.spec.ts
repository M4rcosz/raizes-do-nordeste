import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ReverseLoyaltyForOrderUseCase } from './reverse-loyalty-for-order.use-case';
import type { LoyaltyRepository } from '@modules/loyalty/domain/repositories/loyalty.repository';
import { LoyaltyAccount } from '@modules/loyalty/domain/entities/loyalty-account.entity';

const account = (totalPoints: number): LoyaltyAccount =>
  new LoyaltyAccount('la-1', 'c-1', totalPoints, true, new Date(), null, new Date(), new Date());

const tx = Symbol('tx');

describe('ReverseLoyaltyForOrderUseCase', () => {
  let findByCustomerId: jest.MockedFunction<LoyaltyRepository['findByCustomerId']>;
  let adjust: jest.MockedFunction<LoyaltyRepository['adjust']>;
  let useCase: ReverseLoyaltyForOrderUseCase;

  beforeEach(() => {
    findByCustomerId = jest.fn() as jest.MockedFunction<LoyaltyRepository['findByCustomerId']>;
    adjust = jest.fn() as jest.MockedFunction<LoyaltyRepository['adjust']>;
    adjust.mockResolvedValue(undefined);
    const repo = { findByCustomerId, adjust } as unknown as LoyaltyRepository;
    useCase = new ReverseLoyaltyForOrderUseCase(repo);
  });

  const reverse = (pointsEarned: number, pointsRedeemed: number): Promise<void> =>
    useCase.reverseForOrder(
      { customerId: 'c-1', orderId: 'o-1', pointsEarned, pointsRedeemed },
      tx,
    );

  it('does nothing when there are neither earned nor redeemed points', async () => {
    await reverse(0, 0);
    expect(findByCustomerId).not.toHaveBeenCalled();
    expect(adjust).not.toHaveBeenCalled();
  });

  it('no-ops when the customer has no loyalty account', async () => {
    findByCustomerId.mockResolvedValue(null);
    await reverse(5, 3);
    expect(adjust).not.toHaveBeenCalled();
  });

  it('refunds redeemed points as a positive ADJUSTMENT', async () => {
    findByCustomerId.mockResolvedValue(account(0));

    await reverse(0, 4);

    expect(adjust).toHaveBeenCalledTimes(1);
    expect(adjust).toHaveBeenCalledWith(
      expect.objectContaining({ loyaltyAccountId: 'la-1', points: 4 }),
      tx,
    );
  });

  it('claws back earned points as a negative ADJUSTMENT', async () => {
    findByCustomerId.mockResolvedValue(account(10));

    await reverse(6, 0);

    expect(adjust).toHaveBeenCalledWith(
      expect.objectContaining({ loyaltyAccountId: 'la-1', points: -6 }),
      tx,
    );
  });

  it('refunds then claws back, capping the clawback at the post-refund balance', async () => {
    // Balance 2, refund 3 -> 5 available, earned 6 -> clawback capped at 5.
    findByCustomerId.mockResolvedValue(account(2));

    await reverse(6, 3);

    expect(adjust).toHaveBeenNthCalledWith(1, expect.objectContaining({ points: 3 }), tx);
    expect(adjust).toHaveBeenNthCalledWith(2, expect.objectContaining({ points: -5 }), tx);
  });

  it('never claws back more than the available balance (no negative balance)', async () => {
    // Balance 1, no refund, earned 10 -> clawback capped at 1.
    findByCustomerId.mockResolvedValue(account(1));

    await reverse(10, 0);

    expect(adjust).toHaveBeenCalledWith(expect.objectContaining({ points: -1 }), tx);
  });

  it('skips the clawback entirely when the balance is already zero', async () => {
    findByCustomerId.mockResolvedValue(account(0));

    await reverse(5, 0);

    expect(adjust).not.toHaveBeenCalled();
  });
});
