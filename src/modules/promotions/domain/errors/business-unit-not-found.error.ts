import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A promotion referenced a business unit that does not exist (FK violation). */
export class BusinessUnitNotFoundError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.NOT_FOUND, message, options);
  }
}
