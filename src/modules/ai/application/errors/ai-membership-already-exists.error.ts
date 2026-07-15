import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** The user already has an AI membership - enroll is a one-time create per user. */
export class AiMembershipAlreadyExistsError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
