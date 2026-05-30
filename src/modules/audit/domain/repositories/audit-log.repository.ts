import { AuditAction } from '../audit-actions';

export interface AuditLogRecord {
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRepository {
  create(record: AuditLogRecord): Promise<void>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AuditLogRepository');
