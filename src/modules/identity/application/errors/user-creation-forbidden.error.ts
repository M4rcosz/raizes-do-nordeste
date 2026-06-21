import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** The actor's role is not allowed to create or deactivate the target user. */
export class UserCreationForbiddenError extends ApplicationError {
  constructor(
    message = 'You are not allowed to perform this action.',
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.FORBIDDEN, message, options);
  }
}
