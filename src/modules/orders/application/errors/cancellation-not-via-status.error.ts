import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A status change tried to move an order to CANCELLED. Cancellation is not a plain status
 * transition: it must run its compensations (refund, restock, loyalty reversal) through the
 * dedicated cancellation flow. Allowing it here would silently skip all of them, so the
 * status endpoint rejects CANCELLED outright.
 */
export class CancellationNotAllowedViaStatusError extends ApplicationError {
  constructor() {
    super(
      ERROR_KINDS.INVALID,
      'An order cannot be cancelled through a status change; use the dedicated cancellation flow.',
    );
  }
}
