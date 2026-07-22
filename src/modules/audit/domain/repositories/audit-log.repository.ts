import type { TimestampKeyset } from '@shared/pagination/keyset-cursor';
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

/**
 * Deliberately NOT CursorPaginationParams: `keyset` is the sort key of the previous
 * page's last row, not a row id to seek to. Here the keyset timestamp is createdAt.
 */
export interface FindAuditLogsInput {
  filters?: AuditLogFilters;
  take: number;
  keyset?: TimestampKeyset;
}

export interface AuditLogRepository {
  create(record: AuditLogRecord): Promise<void>;
  findMany(input: FindAuditLogsInput): Promise<AuditLog[]>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AuditLogRepository');
