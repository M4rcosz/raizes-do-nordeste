import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The presented refresh token cannot be honored. Deliberately one error for
 * every failing condition (missing, expired, revoked, reused, user no longer
 * able to log in) so the response never reveals which one tripped.
 */
export class InvalidRefreshTokenError extends ApplicationError {
  constructor(message = 'Invalid refresh token.', options?: { cause?: unknown }) {
    super(ERROR_KINDS.UNAUTHORIZED, message, options);
  }
}
