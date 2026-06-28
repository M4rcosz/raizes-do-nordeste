import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogFilters,
  type AuditLogRepository,
} from '@modules/audit/domain/repositories/audit-log.repository';
import { AuditLog } from '@modules/audit/domain/entities/audit-log.entity';
import { buildCursorMeta, type CursorPaginatedResult } from '@shared/pagination/pagination';
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

    // Cross-field rule: an inverted window can only ever return nothing, so reject it.
    if (filters?.from && filters?.to && filters.from > filters.to) {
      throw new InvalidAuditLogWindowError();
    }

    let items: AuditLog[];
    try {
      // Fetch one extra row to know whether another page exists.
      items = await this.repo.findMany({
        filters,
        pagination: { cursor, take: limit + 1 },
      });
    } catch (err) {
      throw new AuditLogsFetchError('Could not retrieve audit logs.', { cause: err });
    }

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const lastItemId = trimmed[trimmed.length - 1]?.id;

    return {
      data: trimmed,
      meta: buildCursorMeta(limit, hasMore, lastItemId),
    };
  }
}
