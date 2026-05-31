import { ApiProperty } from '@nestjs/swagger';
import { OrderResponseDto } from './order-response.dto';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can
 * describe the generic `PaginatedResponseDto<OrderResponseDto>` returned by
 * the list endpoint (OpenAPI has no generics — a concrete class is needed).
 * Keep its shape in sync with `PaginatedResponseDto` + `CursorPaginationMeta`.
 */
class CursorPaginationMetaDto {
  @ApiProperty({ example: 20, description: 'Applied page size' })
  public readonly limit!: number;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    type: String,
    nullable: true,
    description: 'Cursor for the next page; null when there are no more items',
  })
  public readonly nextCursor!: string | null;

  @ApiProperty({ example: true })
  public readonly hasMore!: boolean;
}

export class PaginatedOrderResponseDto {
  @ApiProperty({ type: [OrderResponseDto] })
  public readonly data!: OrderResponseDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  public readonly meta!: CursorPaginationMetaDto;
}
