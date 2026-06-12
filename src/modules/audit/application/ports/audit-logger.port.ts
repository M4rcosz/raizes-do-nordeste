import { AuditLogRecord } from '@modules/audit/domain/repositories/audit-log.repository';

export type AuditLogInput = AuditLogRecord;

export interface AuditLogger {
  /**
   * Records an audit entry. Best-effort by contract: it never throws on a persistence
   * failure (the implementation logs and swallows), so callers can `await` it without a
   * guard and a broken audit write never fails or rolls back the business operation.
   */
  log(input: AuditLogInput): Promise<void>;
}

export const AUDIT_LOGGER = Symbol('AuditLogger');
