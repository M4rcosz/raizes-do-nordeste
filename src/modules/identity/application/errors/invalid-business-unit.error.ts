import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * One or more business unit ids in a scope-assignment request do not exist.
 * Surfaced from the repo when the join insert hits a foreign-key violation
 * (P2003). Mapped to 422 (invalid input) without echoing the offending ids.
 */
export class InvalidBusinessUnitError extends ApplicationError {
  constructor(options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, 'One or more business units do not exist.', options);
  }
}
