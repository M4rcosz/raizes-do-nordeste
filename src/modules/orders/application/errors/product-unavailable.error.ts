import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A product is on the business unit menu but is currently flagged unavailable (BusinessUnitMenuItem.isAvailable = false). */
export class ProductUnavailableError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
