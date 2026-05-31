import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A channel that requires a staff member was used by an actor without attendant privileges. */
export class AttendantRequiredError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.FORBIDDEN, message, options);
  }
}
