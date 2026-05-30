import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** unitPrice in the request body did not match the authoritative price for the product at the business unit. */
export class PriceMismatchError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
