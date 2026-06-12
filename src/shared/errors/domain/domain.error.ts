import { ErrorKind } from '../errors.type';

/**
 * Base class for domain-rule violations (invariants broken in `domain/`). Carries a
 * transport-agnostic {@link ErrorKind} that the global filter maps to an HTTP status -
 * the domain never throws `HttpException`. `new.target.name` sets `name` to the actual
 * subclass (e.g. `InvalidOrderStatusTransitionError`), not `DomainError`.
 */
export class DomainError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.kind = kind;
    this.name = new.target.name;
  }
}
