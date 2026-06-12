import { ApiProperty } from '@nestjs/swagger';

/**
 * Schema-only DTO: never instantiated at runtime. It exists so Swagger can
 * describe the `meta` envelope returned alongside cursor-paginated lists
 * (OpenAPI has no generics - a concrete class is needed). Keep its shape in
 * sync with `CursorPaginationMeta` in `pagination.ts`.
 */
export class CursorPaginationMetaDto {
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
