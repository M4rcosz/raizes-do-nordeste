import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ExpireIdempotencyKeysUseCase } from '../../application/use-cases/expire-idempotency-keys.use-case';

/** How often the sweep runs. Keys live ~24h, so an hourly sweep keeps the table small. */
const SWEEP_INTERVAL_MS = 60 * 60_000;

/**
 * Dependency-free scheduler for reaping expired idempotency keys (no @nestjs/schedule
 * yet, same approach as StalePaymentSweeper). The timer is unref'd so it never keeps the
 * process - or a Jest worker - alive, and it is cleared on shutdown.
 */
@Injectable()
export class IdempotencyKeySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyKeySweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly expireKeys: ExpireIdempotencyKeysUseCase) {}

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
      const removed = await this.expireKeys.execute();
      if (removed > 0) {
        this.logger.log(`Reaped ${removed} expired idempotency key(s).`);
      }
    } catch (err) {
      this.logger.error(
        'Idempotency key sweep failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
