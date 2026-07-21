import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The requested reporting window is inverted (from is after to). Caught here rather
 * than handed to the database, which would happily return an empty aggregate and
 * make the report look like "nobody spent anything".
 */
export class InvalidUsagePeriodError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
