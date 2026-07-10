import { describe, expect, it, jest } from '@jest/globals';
import {
  REFUND_RECONCILIATION_SWEEP_INTERVAL_MS,
  RefundReconciliationSweeper,
} from './refund-reconciliation.sweeper';
import { ReconcileCancelledRefundsUseCase } from '@modules/payments/application/use-cases/reconcile-cancelled-refunds.use-case';

// The timer lifecycle and the swallow-and-log policy are covered once, in
// interval-sweeper.spec.ts. All this subclass adds is three declarations, so
// that is all this spec asserts.
type SweeperInternals = {
  sweepOnce(): Promise<number>;
  describeSweep(count: number): string;
  failureMessage: string;
};

const build = (execute: jest.MockedFunction<() => Promise<number>>): SweeperInternals =>
  new RefundReconciliationSweeper({
    execute,
  } as unknown as ReconcileCancelledRefundsUseCase) as unknown as SweeperInternals;

describe('RefundReconciliationSweeper', () => {
  it('reconciles every 10 minutes', () => {
    expect(REFUND_RECONCILIATION_SWEEP_INTERVAL_MS).toBe(10 * 60_000);
  });

  it('runs one pass by retrying owed refunds', async () => {
    const execute = jest.fn<() => Promise<number>>().mockResolvedValue(1);

    await expect(build(execute).sweepOnce()).resolves.toBe(1);
    expect(execute).toHaveBeenCalledWith();
  });

  it('describes a non-empty pass', () => {
    const execute = jest.fn<() => Promise<number>>();

    expect(build(execute).describeSweep(2)).toBe(
      'Reconciled 2 owed refund(s) on cancelled order(s).',
    );
  });

  it('names itself in the failure log', () => {
    const execute = jest.fn<() => Promise<number>>();

    expect(build(execute).failureMessage).toBe('Refund reconciliation sweep failed');
  });
});
