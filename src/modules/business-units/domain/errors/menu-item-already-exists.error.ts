import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A menu item for the same product already exists in the business unit. */
export class MenuItemAlreadyExistsError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
