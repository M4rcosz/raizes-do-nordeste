import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The target's role changed (or it was already active) between the authorization
 * read and the conditional write. Symmetric to UserDeactivationConflictError.
 */
export class UserReactivationConflictError extends ApplicationError {
  constructor(
    message = 'User state changed during reactivation; please retry.',
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
