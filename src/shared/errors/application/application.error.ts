import { ErrorKind } from '../errors.type';

/**
 * Base class for application-layer failures (use cases orchestrating work, often
 * wrapping an infrastructure error via `cause`). Carries a transport-agnostic
 * {@link ErrorKind} the global filter maps to an HTTP status. `new.target.name`
 * sets `name` to the actual subclass (e.g. `OrdersFetchError`), not `ApplicationError`.
 */
export class ApplicationError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.kind = kind;
    this.name = new.target.name;
  }
}
