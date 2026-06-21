import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { PromotionResponseDto } from './promotion-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can describe the
 * generic PaginatedResponseDto<PromotionResponseDto> returned by the list endpoint
 * (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedPromotionResponseDto {
  @ApiProperty({ type: [PromotionResponseDto] })
  public readonly data!: PromotionResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
