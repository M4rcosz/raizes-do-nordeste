import { describe, expect, it, jest } from '@jest/globals';
import {
  RESERVATION_TTL_MS,
  STALE_PAYMENT_SWEEP_INTERVAL_MS,
  StalePaymentSweeper,
} from './stale-payment.sweeper';
import { ExpireStalePaymentsUseCase } from '@modules/payments/application/use-cases/expire-stale-payments.use-case';

// The timer lifecycle and the swallow-and-log policy are covered once, in
// interval-sweeper.spec.ts. All this subclass adds is three declarations, so
// that is all this spec asserts.
type SweeperInternals = {
  sweepOnce(): Promise<number>;
  describeSweep(count: number): string;
  failureMessage: string;
};

const build = (
  execute: jest.MockedFunction<(ttlMs: number) => Promise<number>>,
): SweeperInternals =>
  new StalePaymentSweeper({
    execute,
  } as unknown as ExpireStalePaymentsUseCase) as unknown as SweeperInternals;

describe('StalePaymentSweeper', () => {
  it('sweeps every 5 minutes', () => {
    expect(STALE_PAYMENT_SWEEP_INTERVAL_MS).toBe(5 * 60_000);
  });

  it('cancels reservations older than 15 minutes', () => {
    expect(RESERVATION_TTL_MS).toBe(15 * 60_000);
  });

  // The TTL is the whole point of this sweeper: pass the wrong one and it either
  // cancels live reservations or never cancels anything.
  it('runs one pass by expiring reservations past the TTL', async () => {
    const execute = jest.fn<(ttlMs: number) => Promise<number>>().mockResolvedValue(3);

    await expect(build(execute).sweepOnce()).resolves.toBe(3);
    expect(execute).toHaveBeenCalledWith(RESERVATION_TTL_MS);
  });

  it('describes a non-empty pass', () => {
    const execute = jest.fn<(ttlMs: number) => Promise<number>>();

    expect(build(execute).describeSweep(2)).toBe('Cancelled 2 stale payment reservation(s).');
  });

  it('names itself in the failure log', () => {
    const execute = jest.fn<(ttlMs: number) => Promise<number>>();

    expect(build(execute).failureMessage).toBe('Stale payment sweep failed');
  });
});
