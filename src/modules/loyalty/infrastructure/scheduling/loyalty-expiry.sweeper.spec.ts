import { describe, expect, it, jest } from '@jest/globals';
import { LOYALTY_EXPIRY_SWEEP_INTERVAL_MS, LoyaltyExpirySweeper } from './loyalty-expiry.sweeper';
import { ExpireLoyaltyPointsUseCase } from '@modules/loyalty/application/use-cases/expire-loyalty-points.use-case';

// The timer lifecycle and the swallow-and-log policy are covered once, in
// interval-sweeper.spec.ts. All this subclass adds is three declarations, so
// that is all this spec asserts.
type SweeperInternals = {
  sweepOnce(): Promise<number>;
  describeSweep(count: number): string;
  failureMessage: string;
};

const build = (execute: jest.MockedFunction<() => Promise<number>>): SweeperInternals =>
  new LoyaltyExpirySweeper({
    execute,
  } as unknown as ExpireLoyaltyPointsUseCase) as unknown as SweeperInternals;

describe('LoyaltyExpirySweeper', () => {
  it('expires points once a day', () => {
    expect(LOYALTY_EXPIRY_SWEEP_INTERVAL_MS).toBe(24 * 60 * 60_000);
  });

  it('runs one pass by expiring points past their window', async () => {
    const execute = jest.fn<() => Promise<number>>().mockResolvedValue(7);

    await expect(build(execute).sweepOnce()).resolves.toBe(7);
    expect(execute).toHaveBeenCalledWith();
  });

  it('describes a non-empty pass', () => {
    const execute = jest.fn<() => Promise<number>>();

    expect(build(execute).describeSweep(7)).toBe('Expired 7 loyalty point(s) past their window.');
  });

  it('names itself in the failure log', () => {
    const execute = jest.fn<() => Promise<number>>();

    expect(build(execute).failureMessage).toBe('Loyalty expiry sweep failed');
  });
});
