import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** The product already has an inventory row at this business unit. */
export class InventoryAlreadyExistsError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
