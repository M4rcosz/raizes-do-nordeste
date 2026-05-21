import { AuditLogRecord } from '@modules/audit/domain/repositories/audit-log.repository';

export type AuditLogInput = AuditLogRecord;

export interface IAuditLogger {
  log(input: AuditLogInput): Promise<void>;
}

export const AUDIT_LOGGER = Symbol('AuditLogger');
