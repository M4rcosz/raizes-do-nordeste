import { Inject, Injectable } from '@nestjs/common';
import { IDEMPOTENCY_STORE, type IdempotencyStore } from '../ports/idempotency-store.port';

/**
 * Reaps idempotency keys past their TTL. Keeping the table small is the only job:
 * an expired key carries no business state, so this is a plain delete with no audit.
 */
@Injectable()
export class ExpireIdempotencyKeysUseCase {
  constructor(
    @Inject(IDEMPOTENCY_STORE)
    private readonly store: IdempotencyStore,
  ) {}

  execute(now: Date = new Date()): Promise<number> {
    return this.store.deleteExpired(now);
  }
}
