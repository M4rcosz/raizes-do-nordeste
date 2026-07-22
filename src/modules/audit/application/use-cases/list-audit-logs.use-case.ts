import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogFilters,
  type AuditLogRepository,
} from '@modules/audit/domain/repositories/audit-log.repository';
import { AuditLog } from '@modules/audit/domain/entities/audit-log.entity';
import { buildCursorPage, type CursorPaginatedResult } from '@shared/pagination/pagination';
import { decodeAuditLogCursor, encodeAuditLogCursor } from '../audit-log-keyset-cursor';
import { AuditLogsFetchError } from '../errors/audit-logs-fetch.error';
import { InvalidAuditLogWindowError } from '../errors/invalid-audit-log-window.error';

export interface ListAuditLogsInput {
  filters?: AuditLogFilters;
  cursor?: string;
  limit: number;
}

@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repo: AuditLogRepository,
  ) {}

  async execute(input: ListAuditLogsInput): Promise<CursorPaginatedResult<AuditLog>> {
    const { filters, cursor, limit } = input;

    // Decode before the window check: a malformed token is the caller's error (422),
    // not a repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodeAuditLogCursor(cursor);

    // Cross-field rule: an inverted window can only ever return nothing, so reject it.
    if (filters?.from && filters?.to && filters.from > filters.to) {
      throw new InvalidAuditLogWindowError();
    }

    let items: AuditLog[];
    try {
      // Fetch one extra row to know whether another page exists.
      items = await this.repo.findMany({
        filters,
        take: limit + 1,
        keyset,
      });
    } catch (err) {
      throw new AuditLogsFetchError('Could not retrieve audit logs.', { cause: err });
    }

    return buildCursorPage(items, limit, (log) => encodeAuditLogCursor(log.createdAt, log.id));
  }
}
