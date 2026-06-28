import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** Raised when the requested date window is inverted (from is after to). */
export class InvalidAuditLogWindowError extends ApplicationError {
  constructor(message = 'from must be before or equal to to') {
    super(ERROR_KINDS.INVALID, message);
  }
}
