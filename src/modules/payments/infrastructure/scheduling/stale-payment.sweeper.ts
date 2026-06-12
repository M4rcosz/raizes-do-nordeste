import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ExpireStalePaymentsUseCase } from '../../application/use-cases/expire-stale-payments.use-case';

/** How often the sweep runs. */
const SWEEP_INTERVAL_MS = 5 * 60_000;
/** Reservations older than this (still PENDING, never charged) are cancelled. */
const RESERVATION_TTL_MS = 15 * 60_000;

/**
 * Dependency-free scheduler for the stale-reservation sweep (no @nestjs/schedule yet). The
 * timer is unref'd so it never keeps the process - or a Jest worker - alive, and it is
 * cleared on shutdown. Real cron/queue scheduling can replace this later without touching
 * the use case.
 */
@Injectable()
export class StalePaymentSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(StalePaymentSweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly expireStale: ExpireStalePaymentsUseCase) {}

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
      const cancelled = await this.expireStale.execute(RESERVATION_TTL_MS);
      if (cancelled > 0) {
        this.logger.log(`Cancelled ${cancelled} stale payment reservation(s).`);
      }
    } catch (err) {
      this.logger.error(
        'Stale payment sweep failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
