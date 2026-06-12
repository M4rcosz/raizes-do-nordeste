import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The order total breaks the discount invariant: it must be a non-negative amount no
 * greater than the gross items subtotal (discount in the range [0, subtotal]). Guards
 * both the write-time computation and reconstitution from a corrupt persisted total.
 */
export class InvalidOrderTotalError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
