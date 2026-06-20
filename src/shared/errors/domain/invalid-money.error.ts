import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A monetary amount could not be built or is malformed: a value that big.js
 * rejects (NaN, empty or non-numeric string), or a cents input that is not a
 * finite integer. Guards the entry borders of the Money VO.
 */
export class InvalidMoneyError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
