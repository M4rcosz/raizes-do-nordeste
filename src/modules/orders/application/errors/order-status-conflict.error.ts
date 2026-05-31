import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The order's status changed between the read and the write (optimistic-lock
 * failure): the conditional update matched no row because the expected "from"
 * status no longer holds. Signals a concurrent transition, mapped to 409.
 */
export class OrderStatusConflictError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
