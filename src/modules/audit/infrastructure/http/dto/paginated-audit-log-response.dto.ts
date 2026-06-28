import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { AuditLogResponseDto } from './audit-log-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can
 * describe the generic `PaginatedResponseDto<AuditLogResponseDto>` returned by
 * the list endpoint (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedAuditLogResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  public readonly data!: AuditLogResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
