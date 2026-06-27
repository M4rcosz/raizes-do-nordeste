import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A requested menu item could not be found (or is not available). */
export class MenuItemNotFoundError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.NOT_FOUND, message, options);
  }
}
