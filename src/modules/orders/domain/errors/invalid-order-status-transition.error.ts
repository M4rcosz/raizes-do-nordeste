import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** An order status change was requested that the state machine does not allow (e.g. PENDING -> DELIVERED, or any change out of a terminal state). */
export class InvalidOrderStatusTransitionError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
