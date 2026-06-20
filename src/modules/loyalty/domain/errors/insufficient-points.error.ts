import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A redemption asked for more points than the account can give (no consent, balance
 * too low, or non-positive amount). A client-correctable request, not a race - the
 * concurrent-debit loser maps to CONFLICT in persistence instead.
 */
export class InsufficientPointsError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
