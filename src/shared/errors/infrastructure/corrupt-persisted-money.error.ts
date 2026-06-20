import { InfrastructureError } from '@shared/errors/infrastructure/infrastructure.error';

/**
 * A monetary value read back from the database could not be parsed into Money.
 * This means the persisted data is corrupt, a server-side fault, not a client
 * error. The message is fixed and generic so the raw value never leaks to the
 * client; the parse failure travels in `cause` for server-side logs only.
 */
export class CorruptPersistedMoneyError extends InfrastructureError {
  constructor(options?: { cause?: unknown }) {
    super('A persisted monetary value is corrupt.', options);
  }
}
