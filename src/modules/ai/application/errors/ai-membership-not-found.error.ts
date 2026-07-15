import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** The user has no AI membership yet (an admin has not enrolled them). */
export class AiMembershipNotFoundError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.NOT_FOUND, message, options);
  }
}
