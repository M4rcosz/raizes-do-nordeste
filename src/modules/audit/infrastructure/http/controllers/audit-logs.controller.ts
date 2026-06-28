import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListAuditLogsUseCase } from '@modules/audit/application/use-cases/list-audit-logs.use-case';
import type { AuditLogFilters } from '@modules/audit/domain/repositories/audit-log.repository';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { Roles } from '@shared/auth/roles.decorator';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { AuditLogResponseDto } from '../dto/audit-log-response.dto';
import { PaginatedAuditLogResponseDto } from '../dto/paginated-audit-log-response.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly listAuditLogs: ListAuditLogsUseCase) {}

  @Get()
  @Roles([UserRole.ADMIN])
  @ApiOperation({
    summary: 'List audit logs with optional filters (cursor-paginated). Admin only.',
  })
  @ApiOkResponse({ type: PaginatedAuditLogResponseDto })
  async list(@Query() query: AuditLogQueryDto): Promise<PaginatedResponseDto<AuditLogResponseDto>> {
    const { limit: rawLimit, cursor, from, to, userId, action, entity, entityId } = query;
    const limit = sanitizeLimit(rawLimit);

    // Build filters with only the params the caller actually sent.
    const filters: AuditLogFilters = {};
    if (from !== undefined) {
      filters.from = from;
    }
    if (to !== undefined) {
      filters.to = to;
    }
    if (userId !== undefined) {
      filters.userId = userId;
    }
    if (action !== undefined) {
      filters.action = action;
    }
    if (entity !== undefined) {
      filters.entity = entity;
    }
    if (entityId !== undefined) {
      filters.entityId = entityId;
    }

    const result = await this.listAuditLogs.execute({ cursor, limit, filters });

    return new PaginatedResponseDto(
      result.data.map((log) => AuditLogResponseDto.fromEntity(log)),
      result.meta,
    );
  }
}
