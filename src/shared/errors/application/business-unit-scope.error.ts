import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A scoped actor reached a business unit they are not bound to. Mapped to
 * not-found on purpose: a staff member of another unit must not learn whether
 * the requested unit (or its resources) exists. The message stays generic for
 * the same reason.
 */
export class BusinessUnitScopeError extends ApplicationError {
  constructor() {
    super(ERROR_KINDS.NOT_FOUND, 'Business unit not found.');
  }
}
