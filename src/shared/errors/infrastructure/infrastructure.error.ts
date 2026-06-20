/**
 * Base class for infrastructure failures (DB, gateways, persisted-data corruption).
 * Unlike DomainError/ApplicationError it carries NO ErrorKind: these are server
 * faults, not client faults. The global filter has no mapping for them, so they
 * fall through to the catch-all branch -> HTTP 500 with a generic message, while
 * the original `cause` is logged (never echoed to the client). `new.target.name`
 * sets `name` to the actual subclass.
 */
export class InfrastructureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}
