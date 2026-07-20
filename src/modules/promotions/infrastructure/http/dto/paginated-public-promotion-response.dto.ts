import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { PublicPromotionResponseDto } from './promotion-public-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can describe the
 * generic PaginatedResponseDto<PublicPromotionResponseDto> returned by the public list
 * endpoint (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedPublicPromotionResponseDto {
  @ApiProperty({ type: [PublicPromotionResponseDto] })
  public readonly data!: PublicPromotionResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
