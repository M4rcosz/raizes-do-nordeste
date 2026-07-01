import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ExpireLoyaltyPointsUseCase } from '../../application/use-cases/expire-loyalty-points.use-case';

/** How often the expiry sweep runs. Points live ~12 months, so a daily pass is ample. */
const SWEEP_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * Dependency-free scheduler for the loyalty point expiry sweep (no @nestjs/schedule yet,
 * same approach as StalePaymentSweeper). The timer is unref'd so it never keeps the
 * process - or a Jest worker - alive, and it is cleared on shutdown.
 */
@Injectable()
export class LoyaltyExpirySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyExpirySweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly expirePoints: ExpireLoyaltyPointsUseCase) {}

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
      const expired = await this.expirePoints.execute();
      if (expired > 0) {
        this.logger.log(`Expired ${expired} loyalty point(s) past their window.`);
      }
    } catch (err) {
      this.logger.error(
        'Loyalty expiry sweep failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
