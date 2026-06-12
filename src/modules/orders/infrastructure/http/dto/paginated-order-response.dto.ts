import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import { OrderResponseDto } from './order-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can
 * describe the generic `PaginatedResponseDto<OrderResponseDto>` returned by
 * the list endpoint (OpenAPI has no generics - a concrete class is needed).
 */
export class PaginatedOrderResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  public readonly data!: OrderResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
