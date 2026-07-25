import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A storage object path is not a well-formed product image path, or belongs to a
 * different product. Raised when re-parsing the path a client echoes back on
 * confirm, so a caller cannot point the confirm step at someone else's object.
 */
export class InvalidProductImagePathError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
