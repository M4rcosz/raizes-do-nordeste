import { Module } from '@nestjs/common';
import { AUDIT_LOG_REPOSITORY } from './domain/repositories/audit-log.repository';
import { PrismaAuditLogRepository } from './infrastructure/persistence/prisma-audit-log.repository';
import { AuditService } from './application/services/audit.service';
import { AUDIT_LOGGER } from './application/ports/audit-logger.port';
import { ListAuditLogsUseCase } from './application/use-cases/list-audit-logs.use-case';
import { AuditLogsController } from './infrastructure/http/controllers/audit-logs.controller';

@Module({
  controllers: [AuditLogsController],
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: PrismaAuditLogRepository },
    { provide: AUDIT_LOGGER, useClass: AuditService },
    ListAuditLogsUseCase,
  ],
  exports: [AUDIT_LOGGER],
})
export class AuditModule {}
