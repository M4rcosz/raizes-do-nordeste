import type { CursorPaginationParams } from '@shared/pagination/pagination';
import { AuditAction } from '../audit-actions';
import { AuditLog } from '../entities/audit-log.entity';

export interface AuditLogRecord {
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogFilters {
  from?: Date;
  to?: Date;
  userId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
}

export interface FindAuditLogsInput {
  filters?: AuditLogFilters;
  pagination: CursorPaginationParams;
}

export interface AuditLogRepository {
  create(record: AuditLogRecord): Promise<void>;
  findMany(input: FindAuditLogsInput): Promise<AuditLog[]>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AuditLogRepository');
