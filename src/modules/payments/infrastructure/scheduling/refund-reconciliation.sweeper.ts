import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ReconcileCancelledRefundsUseCase } from '../../application/use-cases/reconcile-cancelled-refunds.use-case';

/** How often the reconciliation runs. Refunds are normally synchronous; this is the safety net. */
const SWEEP_INTERVAL_MS = 10 * 60_000;

/**
 * Dependency-free scheduler that retries refunds owed but not completed (APPROVED payment on
 * a CANCELLED order), the safety net for a crash between the cancel commit and the refund
 * call. Same approach as StalePaymentSweeper: the timer is unref'd so it never keeps the
 * process - or a Jest worker - alive, and it is cleared on shutdown.
 */
@Injectable()
export class RefundReconciliationSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RefundReconciliationSweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly reconcile: ReconcileCancelledRefundsUseCase) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async sweep(): Promise<void> {
    try {
      const refunded = await this.reconcile.execute();
      if (refunded > 0) {
        this.logger.log(`Reconciled ${refunded} owed refund(s) on cancelled order(s).`);
      }
    } catch (err) {
      this.logger.error(
        'Refund reconciliation sweep failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
