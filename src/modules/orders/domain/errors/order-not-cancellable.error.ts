import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * Cancellation was requested past the allowed window. Orders may only be cancelled while
 * PENDING or CONFIRMED; once PREPARING (or beyond) the kitchen has committed to it. A
 * customer is further limited to PENDING (before payment confirms).
 */
export class OrderNotCancellableError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
