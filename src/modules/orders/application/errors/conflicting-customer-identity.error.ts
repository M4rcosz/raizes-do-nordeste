import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The request carried both a customerId and a customerName. Exactly one is ever
 * populated: an account order resolves its display name from the User relation.
 */
export class ConflictingCustomerIdentityError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
