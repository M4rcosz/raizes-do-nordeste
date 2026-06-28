import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The requested new password is identical to the current one. A password change
 * must actually rotate the secret, so a no-op is rejected as semantically invalid
 * input (the body is well-formed but violates the rotation rule).
 */
export class SamePasswordError extends ApplicationError {
  constructor(
    message = 'New password must be different from the current password.',
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
