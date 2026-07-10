import { Injectable } from '@nestjs/common';
import { IntervalSweeper } from '@shared/scheduling/interval-sweeper';
import { ExpireStalePaymentsUseCase } from '../../application/use-cases/expire-stale-payments.use-case';

/** How often the sweep runs. */
export const STALE_PAYMENT_SWEEP_INTERVAL_MS = 5 * 60_000;
/** Reservations older than this (still PENDING, never charged) are cancelled. */
export const RESERVATION_TTL_MS = 15 * 60_000;

/** Cancels stale payment reservations. Timer lifecycle lives in IntervalSweeper. */
@Injectable()
export class StalePaymentSweeper extends IntervalSweeper {
  protected readonly failureMessage = 'Stale payment sweep failed';

  constructor(private readonly expireStale: ExpireStalePaymentsUseCase) {
    super(STALE_PAYMENT_SWEEP_INTERVAL_MS);
  }

  protected sweepOnce(): Promise<number> {
    return this.expireStale.execute(RESERVATION_TTL_MS);
  }

  protected describeSweep(count: number): string {
    return `Cancelled ${count} stale payment reservation(s).`;
  }
}
