import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The target's role changed (or it was already inactive) between the authorization
 * read and the conditional write, so the deactivation was not applied. Authorization
 * was decided on a stale snapshot; the caller must retry against fresh state.
 */
export class UserDeactivationConflictError extends ApplicationError {
  constructor(
    message = 'User state changed during deactivation; please retry.',
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
