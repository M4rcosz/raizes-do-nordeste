import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import {
  AuditLogFilters,
  AuditLogRecord,
  AuditLogRepository,
  FindAuditLogsInput,
} from '@modules/audit/domain/repositories/audit-log.repository';
import { AuditLog } from '@modules/audit/domain/entities/audit-log.entity';

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(record: AuditLogRecord): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: record.userId,
        action: record.action,
        entity: record.entity,
        entityId: record.entityId,
        metadata:
          record.metadata === undefined ? undefined : (record.metadata as Prisma.InputJsonValue),
      },
    });
  }

  async findMany(input: FindAuditLogsInput): Promise<AuditLog[]> {
    const { filters, pagination } = input;

    const rows = await this.prisma.auditLog.findMany({
      where: this.buildWhere(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.take,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
    });

    return rows.map((row) => this.toEntity(row));
  }

  private buildWhere(filters?: AuditLogFilters): Prisma.AuditLogWhereInput {
    if (!filters) {
      return {};
    }
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      };
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.entity) {
      where.entity = filters.entity;
    }
    if (filters.entityId) {
      where.entityId = filters.entityId;
    }
    return where;
  }

  private toEntity(row: {
    id: string;
    userId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }): AuditLog {
    return new AuditLog(
      row.id,
      row.userId,
      row.action,
      row.entity,
      row.entityId,
      row.metadata as Record<string, unknown> | null,
      row.createdAt,
    );
  }
}
