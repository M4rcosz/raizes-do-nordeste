import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** Wraps an infrastructure failure while listing orders. */
export class OrdersFetchError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.UNAVAILABLE, message, options);
  }
}
