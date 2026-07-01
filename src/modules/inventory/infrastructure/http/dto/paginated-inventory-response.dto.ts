import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { InventoryResponseDto } from './inventory-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can describe the
 * generic PaginatedResponseDto<InventoryResponseDto> returned by the list endpoint
 * (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedInventoryResponseDto {
  @ApiProperty({ type: [InventoryResponseDto] })
  public readonly data!: InventoryResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
