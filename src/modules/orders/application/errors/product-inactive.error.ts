import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A product referenced by the order exists but is flagged as inactive (Product.isActive = false). */
export class ProductInactiveError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
