import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { BusinessUnitResponseDto } from './business-unit-response.dto';
import { PublicBusinessUnitResponseDto } from './business-unit-public-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can
 * describe the generic `PaginatedResponseDto<BusinessUnitResponseDto>` returned
 * by the internal list endpoint (OpenAPI has no generics - a concrete class is
 * needed).
 */
export class PaginatedBusinessUnitResponseDto {
  @ApiProperty({ type: [BusinessUnitResponseDto] })
  public readonly data!: BusinessUnitResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}

/** Schema-only DTO for the public, cursor-paginated list endpoint. */
export class PaginatedPublicBusinessUnitResponseDto {
  @ApiProperty({ type: [PublicBusinessUnitResponseDto] })
  public readonly data!: PublicBusinessUnitResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
