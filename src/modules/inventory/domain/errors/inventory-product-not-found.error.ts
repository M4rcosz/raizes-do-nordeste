import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** The productId or businessUnitId references a row that does not exist. */
export class InventoryProductNotFoundError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.NOT_FOUND, message, options);
  }
}
