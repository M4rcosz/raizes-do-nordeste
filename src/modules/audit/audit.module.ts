import { Module } from '@nestjs/common';
import { AUDIT_LOG_REPOSITORY } from './domain/repositories/audit-log.repository';
import { PrismaAuditLogRepository } from './infrastructure/persistence/prisma-audit-log.repository';
import { AuditService } from './application/services/audit.service';
import { AUDIT_LOGGER } from './application/ports/audit-logger.port';

@Module({
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: PrismaAuditLogRepository },
    { provide: AUDIT_LOGGER, useClass: AuditService },
  ],
  exports: [AUDIT_LOGGER],
})
export class AuditModule {}
