import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { CategoryResponseDto } from './category-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can
 * describe the generic `PaginatedResponseDto<CategoryResponseDto>` returned by
 * the list endpoint (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedCategoryResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  public readonly data!: CategoryResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
