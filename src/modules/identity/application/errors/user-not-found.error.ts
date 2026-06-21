import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** No user matched the given id. */
export class UserNotFoundError extends ApplicationError {
  constructor(message = 'User not found.', options?: { cause?: unknown }) {
    super(ERROR_KINDS.NOT_FOUND, message, options);
  }
}
