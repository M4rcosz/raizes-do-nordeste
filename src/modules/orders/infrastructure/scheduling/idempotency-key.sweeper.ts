import { Injectable } from '@nestjs/common';
import { IntervalSweeper } from '@shared/scheduling/interval-sweeper';
import { ExpireIdempotencyKeysUseCase } from '../../application/use-cases/expire-idempotency-keys.use-case';

/** How often the sweep runs. Keys live ~24h, so an hourly sweep keeps the table small. */
export const IDEMPOTENCY_KEY_SWEEP_INTERVAL_MS = 60 * 60_000;

/** Reaps expired idempotency keys so the table stays small. */
@Injectable()
export class IdempotencyKeySweeper extends IntervalSweeper {
  protected readonly failureMessage = 'Idempotency key sweep failed';

  constructor(private readonly expireKeys: ExpireIdempotencyKeysUseCase) {
    super(IDEMPOTENCY_KEY_SWEEP_INTERVAL_MS);
  }

  protected sweepOnce(): Promise<number> {
    return this.expireKeys.execute();
  }

  protected describeSweep(count: number): string {
    return `Reaped ${count} expired idempotency key(s).`;
  }
}
