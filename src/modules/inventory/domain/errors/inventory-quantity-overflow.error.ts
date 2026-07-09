import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * An IN movement would push the balance past MAX_INVENTORY_QUANTITY (int4). The
 * mirror of InsufficientStockError, which guards the bottom of the same range.
 */
export class InventoryQuantityOverflowError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
