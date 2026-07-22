import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MAX_CURSOR_LENGTH } from '@shared/pagination/pagination';

export class CategoriesQueryDto {
  @ApiPropertyOptional({
    example: 20,
    minimum: 1,
    maximum: 100,
    description: 'Items per page (default 20, max 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Cursor from the previous page. Opaque base64url keyset token - pass it back ' +
      'verbatim. A malformed cursor returns 422.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  cursor?: string;

  @ApiPropertyOptional({ example: 'Bebidas' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class CategoryIdParamDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  categoryId!: string;
}
