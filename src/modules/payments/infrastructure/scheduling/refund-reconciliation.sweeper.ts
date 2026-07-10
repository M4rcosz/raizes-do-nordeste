import { Injectable } from '@nestjs/common';
import { IntervalSweeper } from '@shared/scheduling/interval-sweeper';
import { ReconcileCancelledRefundsUseCase } from '../../application/use-cases/reconcile-cancelled-refunds.use-case';

/** How often the reconciliation runs. Refunds are normally synchronous; this is the safety net. */
export const REFUND_RECONCILIATION_SWEEP_INTERVAL_MS = 10 * 60_000;

/**
 * Retries refunds owed but not completed (APPROVED payment on a CANCELLED order),
 * the safety net for a crash between the cancel commit and the refund call.
 */
@Injectable()
export class RefundReconciliationSweeper extends IntervalSweeper {
  protected readonly failureMessage = 'Refund reconciliation sweep failed';

  constructor(private readonly reconcile: ReconcileCancelledRefundsUseCase) {
    super(REFUND_RECONCILIATION_SWEEP_INTERVAL_MS);
  }

  protected sweepOnce(): Promise<number> {
    return this.reconcile.execute();
  }

  protected describeSweep(count: number): string {
    return `Reconciled ${count} owed refund(s) on cancelled order(s).`;
  }
}
