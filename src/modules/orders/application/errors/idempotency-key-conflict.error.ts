import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The same Idempotency-Key was replayed with a different request body. The key
 * identifies one operation, not "the latest request", so this is a client error
 * (409) rather than a silent overwrite.
 */
export class IdempotencyKeyConflictError extends ApplicationError {
  constructor() {
    super(
      ERROR_KINDS.CONFLICT,
      'Idempotency-Key was already used with a different request payload.',
    );
  }
}
