import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CategoryCreateDto {
  @ApiProperty({ example: 'Bebidas', maxLength: 100 })
  @MaxLength(100)
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    example: 'Sucos, refrigerantes e água',
    maxLength: 255,
  })
  @IsOptional()
  @MaxLength(255)
  @IsString()
  description?: string;
}
