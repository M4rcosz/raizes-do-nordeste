import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * An OUT movement would drive the balance below zero, or the product has no
 * inventory row at this unit (treated as zero stock).
 */
export class InsufficientStockError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
