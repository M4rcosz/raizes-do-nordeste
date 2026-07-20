import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** The user AI membership is revoked: chat and balance adjustments are blocked until reinstated. */
export class AiMembershipRevokedError extends ApplicationError {
  constructor(
    message = 'This user AI membership has been revoked.',
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.FORBIDDEN, message, options);
  }
}
