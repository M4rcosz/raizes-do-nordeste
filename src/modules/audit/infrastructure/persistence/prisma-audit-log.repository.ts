import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import {
  AuditLogRecord,
  IAuditLogRepository,
} from '@modules/audit/domain/repositories/audit-log.repository';

@Injectable()
export class PrismaAuditLogRepository implements IAuditLogRepository {
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
}
