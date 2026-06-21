import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A unique field (username/email/phone) collided with an existing user. */
export class UserAlreadyExistsError extends ApplicationError {
  constructor(
    message = 'A user with the same credentials already exists.',
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
