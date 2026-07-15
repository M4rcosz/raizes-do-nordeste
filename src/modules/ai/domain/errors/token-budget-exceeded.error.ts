import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A token operation asked for more than the membership can give (amount above the
 * balance, or a non-positive/non-integer amount). A client-correctable request, not
 * a race - the concurrent-debit loser is handled at the persistence border instead.
 */
export class TokenBudgetExceededError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
