import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** The user has no AI membership, so the assistant is off-limits until an admin enrolls them. */
export class AiNotEnrolledError extends ApplicationError {
  constructor(message = 'You are not enrolled for AI access.') {
    super(ERROR_KINDS.FORBIDDEN, message);
  }
}
