import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** Authentication failed: username/password did not match. */
export class InvalidCredentialsError extends ApplicationError {
  constructor(message = 'Invalid credentials.', options?: { cause?: unknown }) {
    super(ERROR_KINDS.UNAUTHORIZED, message, options);
  }
}
