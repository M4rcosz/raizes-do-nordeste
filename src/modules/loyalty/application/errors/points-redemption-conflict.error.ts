import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The optimistic debit lost a race: a concurrent redemption drained the balance
 * between the read and the conditional UPDATE, so the guarded decrement matched no
 * row. CONFLICT (409) tells the client to retry with a fresh balance. Also covers
 * the duplicate-REDEEM-per-order unique violation (one redemption per order).
 */
export class PointsRedemptionConflictError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
