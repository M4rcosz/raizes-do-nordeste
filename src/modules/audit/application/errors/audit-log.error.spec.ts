import { describe, expect, it } from '@jest/globals';
import { AuditLogPersistenceError } from './audit-log.error';
import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

// NOTE: nothing throws this today (grep finds no other reference). It is kept for the
// audit sink's failure path; these assertions pin the contract so that whenever it is
// wired up, the filter maps it to 503 and the underlying cause survives.
describe('AuditLogPersistenceError', () => {
  it('is an ApplicationError so the global filter handles it', () => {
    expect(new AuditLogPersistenceError('sink down')).toBeInstanceOf(ApplicationError);
  });

  // UNAVAILABLE, not INTERNAL: a failed audit write is a degraded dependency.
  it('carries the UNAVAILABLE kind', () => {
    expect(new AuditLogPersistenceError('sink down').kind).toBe(ERROR_KINDS.UNAVAILABLE);
  });

  it('keeps the message and chains the cause', () => {
    const cause = new Error('connection reset');
    const error = new AuditLogPersistenceError('sink down', { cause });

    expect(error.message).toBe('sink down');
    expect(error.cause).toBe(cause);
  });
});
