import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * Internal signal: the unique constraint rejected the key insert because a
 * concurrent request with the same key committed first. CreateOrder catches this,
 * rolls back its own attempt and replays the winner's result. The CONFLICT kind is
 * only a fallback HTTP mapping for the (buggy) case where it ever escapes uncaught.
 */
export class IdempotencyRaceError extends ApplicationError {
  constructor(options?: { cause?: unknown }) {
    super(ERROR_KINDS.CONFLICT, 'Idempotency-Key is being processed concurrently.', options);
  }
}
