import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** The loyalty account could not be read from persistence. */
export class LoyaltyFetchError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.UNAVAILABLE, message, options);
  }
}
